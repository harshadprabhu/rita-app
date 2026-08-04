import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Push a RITA comment out to its Sampark request as a public note.
//
// Two ways in:
//   POST { "comment_id": "..." }  — real-time, called by a DB trigger on
//     ticket_comments INSERT (only for genuine RITA comments: author_id set,
//     sampark_note_id null, so Sampark-synced notes never loop back).
//   POST ?reconcile=1             — sweep mode, called by a cron. The
//     trigger above is a single fire-and-forget net.http_post with no retry;
//     a transient Sampark/Zoho hiccup (confirmed in practice — the exact
//     same comment succeeds on a bare retry moments later) drops the note
//     forever with no user-facing signal. This finds every comment that's
//     eligible to sync but still has sampark_note_id null and retries each.

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

interface Cfg { serviceUrl: string; portal: string; dataCenter: string; clientId: string; clientSecret: string; refreshToken: string; }

async function loadCfg(supabase: ReturnType<typeof createClient>): Promise<Cfg> {
  const { data } = await supabase.from('integration_settings')
    .select('sampark_service_url, sampark_portal, sampark_data_center').eq('id', 1).maybeSingle();
  const r = (data ?? {}) as Record<string, string | null>;
  return {
    serviceUrl: String(r.sampark_service_url || 'https://sdpondemand.manageengine.in').replace(/\/+$/, ''),
    portal: String(r.sampark_portal || 'itdesk'),
    dataCenter: String(r.sampark_data_center || 'in'),
    clientId: Deno.env.get('SAMPARK_CLIENT_ID') || '',
    clientSecret: Deno.env.get('SAMPARK_CLIENT_SECRET') || '',
    refreshToken: Deno.env.get('SAMPARK_REFRESH_TOKEN') || '',
  };
}

async function getToken(cfg: Cfg): Promise<string> {
  const body = new URLSearchParams({ refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  const t = (j as { access_token?: string }).access_token;
  if (!t) throw new Error(`token exchange failed: ${JSON.stringify(j)}`);
  return t;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Comment = { id: string; body: string; ticket_id: string; author_id: string | null; sampark_note_id: string | null; is_internal: boolean };

/** Push one comment as a Sampark note, retrying transient failures twice (short backoff). */
async function pushComment(supabase: ReturnType<typeof createClient>, cfg: Cfg, cmt: Comment): Promise<{ ok: boolean; noteId?: string; skipped?: string; error?: string }> {
  if (cmt.sampark_note_id || !cmt.author_id || cmt.is_internal || !cmt.body?.trim()) {
    return { ok: true, skipped: 'not_eligible' };
  }

  const { data: t } = await supabase.from('tickets').select('sampark_request_id').eq('id', cmt.ticket_id).maybeSingle();
  const reqId = (t as { sampark_request_id: string | null } | null)?.sampark_request_id;
  if (!reqId) return { ok: true, skipped: 'no_sampark_request' };

  const { data: p } = await supabase.from('profiles').select('display_name').eq('id', cmt.author_id).maybeSingle();
  const author = (p as { display_name: string } | null)?.display_name ?? 'RITA user';

  const input = JSON.stringify({ request_note: { description: `<b>${author} (RITA):</b> ${cmt.body.trim()}`, show_to_requester: true, mark_first_response: false, add_to_linked_requests: false, notify_technician: false } });

  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const token = await getToken(cfg);
      const res = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${reqId}/notes`, {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
        body: new URLSearchParams({ input_data: input }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`SDP note POST ${res.status}: ${text.slice(0, 250)}`);

      const noteId = (() => { try { return JSON.parse(text)?.request_note?.id ?? null; } catch { return null; } })();
      if (noteId) await supabase.from('ticket_comments').update({ sampark_note_id: String(noteId) }).eq('id', cmt.id);
      return { ok: true, noteId: noteId ? String(noteId) : undefined };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < 3) await sleep(attempt * 800);
    }
  }
  console.error(`[sampark-comment-push] comment ${cmt.id} failed after 3 attempts: ${lastError}`);
  return { ok: false, error: lastError };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const reconcile = new URL(req.url).searchParams.get('reconcile') === '1';

  try {
    const cfg = await loadCfg(supabase);

    if (reconcile) {
      // Every comment that's eligible to sync (real RITA comment, not yet
      // synced) whose ticket now has a Sampark id — covers both the
      // "ticket wasn't synced yet when the comment was posted" case and any
      // one-off transient failure the real-time trigger didn't recover from.
      const { data: stuck } = await supabase
        .from('ticket_comments')
        .select('id, body, ticket_id, author_id, sampark_note_id, is_internal')
        .is('sampark_note_id', null)
        .not('author_id', 'is', null)
        .eq('is_internal', false)
        .order('created_at', { ascending: true })
        .limit(50);

      const results = [];
      for (const cmt of (stuck ?? []) as Comment[]) {
        const r = await pushComment(supabase, cfg, cmt);
        results.push({ comment_id: cmt.id, ...r });
      }
      const pushed = results.filter((r) => r.ok && r.noteId).length;
      return new Response(JSON.stringify({ ok: true, scanned: results.length, pushed, results }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { comment_id } = await req.json().catch(() => ({})) as { comment_id?: string };
    if (!comment_id) return new Response(JSON.stringify({ ok: false, error: 'no_comment_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const { data: c } = await supabase.from('ticket_comments')
      .select('id, body, ticket_id, author_id, sampark_note_id, is_internal').eq('id', comment_id).maybeSingle();
    if (!c) return new Response(JSON.stringify({ ok: true, skipped: 'not_found' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

    const result = await pushComment(supabase, cfg, c as Comment);
    return new Response(JSON.stringify(result), { headers: { ...CORS, 'Content-Type': 'application/json', ...(result.ok ? {} : {}) }, status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error('[sampark-comment-push]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
