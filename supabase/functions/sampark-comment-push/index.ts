import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Push a RITA comment out to its Sampark request as a public note. Called by a
// DB trigger on ticket_comments INSERT — only for genuine RITA comments
// (author_id set, sampark_note_id null), so Sampark-synced notes never loop back.
//   POST { "comment_id": "..." }

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { comment_id } = await req.json().catch(() => ({})) as { comment_id?: string };
    if (!comment_id) return new Response(JSON.stringify({ ok: false, error: 'no_comment_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const { data: c } = await supabase.from('ticket_comments')
      .select('id, body, ticket_id, author_id, sampark_note_id, is_internal').eq('id', comment_id).maybeSingle();
    const cmt = c as { body: string; ticket_id: string; author_id: string | null; sampark_note_id: string | null; is_internal: boolean } | null;
    // Skip Sampark-synced notes, internal notes, and bodiless rows.
    if (!cmt || cmt.sampark_note_id || !cmt.author_id || cmt.is_internal || !cmt.body?.trim()) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: t } = await supabase.from('tickets').select('sampark_request_id').eq('id', cmt.ticket_id).maybeSingle();
    const reqId = (t as { sampark_request_id: string | null } | null)?.sampark_request_id;
    if (!reqId) return new Response(JSON.stringify({ ok: true, skipped: 'no_sampark_request' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

    // Author name for the note prefix.
    const { data: p } = await supabase.from('profiles').select('display_name').eq('id', cmt.author_id).maybeSingle();
    const author = (p as { display_name: string } | null)?.display_name ?? 'RITA user';

    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg);
    const input = JSON.stringify({ request_note: { description: `<b>${author} (RITA):</b> ${cmt.body.trim()}`, show_to_requester: true, mark_first_response: false, add_to_linked_requests: false, notify_technician: false } });
    const res = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${reqId}/notes`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
      body: new URLSearchParams({ input_data: input }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`SDP note POST ${res.status}: ${text.slice(0, 250)}`);

    // Record the Sampark note id so the inbound webhook won't re-import it.
    const noteId = (() => { try { return JSON.parse(text)?.request_note?.id ?? null; } catch { return null; } })();
    if (noteId) await supabase.from('ticket_comments').update({ sampark_note_id: String(noteId) }).eq('id', comment_id);

    return new Response(JSON.stringify({ ok: true, noteId }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-comment-push]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
