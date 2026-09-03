import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Proxy for a RITA ticket's Sampark notes — GET lists them, POST adds one.
// Sampark is the single source of truth for the chat, so RITA no longer
// stores comment bodies in ticket_comments; it fetches them on demand and
// caches them in AsyncStorage on the device. Only the ticket→sampark_request_id
// mapping is looked up in the DB here; everything else round-trips Sampark.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

interface Cfg { serviceUrl: string; portal: string; dataCenter: string; clientId: string; clientSecret: string; refreshToken: string; }

async function loadCfg(supabase: ReturnType<typeof createClient>): Promise<Cfg> {
  const { data } = await supabase.from('integration_settings')
    .select('sampark_service_url, sampark_portal, sampark_data_center').eq('id', 1).maybeSingle();
  const row = (data ?? {}) as Record<string, string | null>;
  return {
    serviceUrl: String(row.sampark_service_url || 'https://sdpondemand.manageengine.in').replace(/\/+$/, ''),
    portal: String(row.sampark_portal || 'itdesk'),
    dataCenter: String(row.sampark_data_center || 'in'),
    clientId: Deno.env.get('SAMPARK_CLIENT_ID') || '',
    clientSecret: Deno.env.get('SAMPARK_CLIENT_SECRET') || '',
    refreshToken: Deno.env.get('SAMPARK_REFRESH_TOKEN') || '',
  };
}

// Uses the DB-cached Zoho access token when it's still valid for ≥5 minutes,
// otherwise refreshes once and writes the new pair back. Every edge fn +
// every instance shares the same cache row, so even a 3s live-chat poll
// refreshes Zoho at most ~once per hour — well under Zoho's OAuth rate cap.
async function getToken(cfg: Cfg, supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: cached } = await supabase
    .from('integration_settings')
    .select('sampark_access_token, sampark_access_expires_at')
    .eq('id', 1).maybeSingle();
  const cachedRow = (cached ?? {}) as { sampark_access_token?: string | null; sampark_access_expires_at?: string | null };
  if (cachedRow.sampark_access_token && cachedRow.sampark_access_expires_at) {
    const expiresMs = new Date(cachedRow.sampark_access_expires_at).getTime();
    if (expiresMs - Date.now() > 5 * 60 * 1000) {
      return cachedRow.sampark_access_token;
    }
  }
  const body = new URLSearchParams({
    refresh_token: cfg.refreshToken, client_id: cfg.clientId,
    client_secret: cfg.clientSecret, grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  const text = await res.text();
  if (!res.ok) throw new Error(`token refresh ${res.status}: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text);
  const t = parsed.access_token as string | undefined;
  if (!t) throw new Error(`token refresh no access_token: ${text.slice(0, 400)}`);
  const expiresInSec = Number(parsed.expires_in) || 3600;
  // Store slightly before actual expiry so pinning near-expiry callers doesn't race.
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  await supabase.from('integration_settings')
    .update({ sampark_access_token: t, sampark_access_expires_at: expiresAt })
    .eq('id', 1);
  return t;
}

/**
 * Simplified note shape returned to the app — same regardless of direction.
 * Sampark's raw structure is huge; we distill it to what the UI actually
 * needs so the local AsyncStorage cache stays lean.
 */
interface AppNote {
  id: string;               // Sampark's note id
  author: string;           // "Yajuvender Rawat" or "harshad prabhu (RITA)"
  authorEmail: string | null;
  body: string;             // Description with HTML stripped
  createdAt: string;        // ISO timestamp
  fromRita: boolean;        // Was this note written from the RITA app side?
  showToRequester: boolean; // Public vs. internal in Sampark
}

// Handles two SDP shapes:
//  - /notes items:            { description, created_by, created_time, show_to_requester }
//  - /notifications REQREPLY: { description, sender,     time,         is_public }
function normalize(raw: Record<string, unknown>): AppNote {
  const rawDesc = String((raw.description as string) || '');
  // REQREPLY bodies are full HTML emails (contenteditable divs, quoted
  // history, etc.). Strip tags AND collapse any lines after the first
  // "On <date>, <name> wrote:" quote — the reply above the quote is what
  // the user actually typed.
  const stripped = rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const quotedIdx = stripped.search(/^On\s+.+\swrote:$/mi);
  const description = (quotedIdx > 0 ? stripped.slice(0, quotedIdx) : stripped).trim();

  const author = (raw.created_by as any) ?? (raw.sender as any) ?? {};
  const authorName = String(author?.name || 'Support');
  const authorEmail = (author?.email_id as string) ?? null;

  const ritaMatch = description.match(/^(.+?)\s+\(RITA\):\s*(.*)$/s);
  const fromRita = !!ritaMatch;
  const body = fromRita ? ritaMatch![2].trim() : description;
  const displayAuthor = fromRita ? ritaMatch![1].trim() : authorName;

  const timeVal = ((raw.created_time as any)?.value ?? (raw.time as any)?.value) as string | undefined;
  const createdAt = timeVal ? new Date(Number(timeVal)).toISOString() : new Date().toISOString();
  const visible = (raw.show_to_requester as boolean | undefined) ?? (raw.is_public as boolean | undefined) ?? true;

  return {
    id: String(raw.id),
    author: displayAuthor,
    authorEmail,
    body,
    createdAt,
    fromRita,
    showToRequester: visible !== false,
  };
}

async function resolveRequestId(
  supabase: ReturnType<typeof createClient>,
  ticketId: string,
): Promise<{ requestId: string; err?: undefined } | { requestId?: undefined; err: string }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('sampark_request_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (error) return { err: `db lookup failed: ${error.message}` };
  const req = (data as { sampark_request_id?: string } | null)?.sampark_request_id;
  if (!req) return { err: 'ticket has no sampark_request_id yet (still syncing)' };
  return { requestId: req };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const cfg = await loadCfg(supabase);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const ticketId = url.searchParams.get('ticket_id') ?? '';
      if (!ticketId) {
        return new Response(JSON.stringify({ error: 'ticket_id required' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const r = await resolveRequestId(supabase, ticketId);
      if (r.err) return new Response(JSON.stringify({ error: r.err }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      const token = await getToken(cfg, supabase);

      const sdp = async (path: string): Promise<any> => {
        const rr = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3${path}`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
        });
        const t = await rr.text();
        if (!rr.ok) throw new Error(`GET ${path} ${rr.status}: ${t.slice(0, 200)}`);
        return JSON.parse(t);
      };

      // 1) /notes — the "Notes" tab in Sampark. Contains RITA-authored
      //    messages (posted via POST below) + any note a technician typed
      //    directly on the Notes tab.
      let notesFromApi: Record<string, unknown>[] = [];
      try {
        const notesJson = await sdp(
          `/requests/${r.requestId}/notes?input_data=${encodeURIComponent(JSON.stringify({ list_info: { row_count: 200 } }))}`,
        );
        notesFromApi = (notesJson.notes ?? []) as Record<string, unknown>[];
      } catch (e) { console.warn('[sampark-notes] notes fetch failed:', e); }

      // 2) /conversations — the email-thread items on the request. This is
      //    where technician REPLIES (type=REQREPLY) live. Sampark's chat
      //    UX makes technicians "Reply" more often than "Add Note", so
      //    without this we miss most of the actual chat.
      let repliesFromApi: Record<string, unknown>[] = [];
      try {
        const convJson = await sdp(`/requests/${r.requestId}/conversations`);
        const convs = (convJson.conversations ?? []) as Record<string, any>[];
        // Only visible technician replies count — skip system emails
        // (RequesterAck_E-Mail, Technician_E-Mail, REQESCALATION, etc.)
        const visibleReplies = convs.filter((c) => c.type === 'REQREPLY' && c.show_to_requester !== false);
        for (const c of visibleReplies) {
          try {
            const detailJson = await sdp(`/requests/${r.requestId}/notifications/${c.id}`);
            const n = detailJson.notification;
            if (n) repliesFromApi.push(n as Record<string, unknown>);
          } catch (e) { console.warn('[sampark-notes] reply detail failed:', c.id, e); }
        }
      } catch (e) { console.warn('[sampark-notes] conversations fetch failed:', e); }

      // Merge, dedupe by id, sort oldest-first for natural chat append.
      const seen = new Set<string>();
      const merged: AppNote[] = [];
      for (const raw of [...notesFromApi, ...repliesFromApi]) {
        const n = normalize(raw);
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        merged.push(n);
      }
      merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      return new Response(JSON.stringify({ ok: true, notes: merged }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const payload = await req.json().catch(() => ({}));
      const { ticket_id, body, requester_name } = payload as { ticket_id?: string; body?: string; requester_name?: string };
      if (!ticket_id || !body?.trim()) {
        return new Response(JSON.stringify({ error: 'ticket_id and body required' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const r = await resolveRequestId(supabase, ticket_id);
      if (r.err) return new Response(JSON.stringify({ error: r.err }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      const token = await getToken(cfg, supabase);
      // Prefix with `<user> (RITA):` so the normalize() step on any subsequent
      // GET flags it as fromRita — same convention sampark-comment-push used.
      const authoredBody = requester_name ? `${requester_name} (RITA): ${body.trim()}` : body.trim();
      // SDP v3 wants `request_note` as the wrapper key, NOT `note`. Confirmed
      // live: `{"note": …}` returns 400 EXTRA_KEY_FOUND_IN_JSON (field=note),
      // which the app previously swallowed — the composer cleared, the POST
      // silently failed, and nothing appeared in chat. Old working payload is
      // preserved verbatim from the retired sampark-comment-push fn.
      const form = new URLSearchParams({
        input_data: JSON.stringify({
          request_note: {
            description: authoredBody,
            show_to_requester: true,
            mark_first_response: false,
            add_to_linked_requests: false,
            notify_technician: false,
          },
        }),
      });
      const posted = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${r.requestId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: SDP_ACCEPT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
      const text = await posted.text();
      if (!posted.ok) {
        return new Response(JSON.stringify({ error: `sampark ${posted.status}`, detail: text.slice(0, 500) }), {
          status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const json = JSON.parse(text);
      // Response mirrors the request wrapper: `request_note` on POST, not `note`.
      const raw = json.request_note ?? json.note ?? {};
      return new Response(JSON.stringify({ ok: true, note: normalize(raw) }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sampark-notes]', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
