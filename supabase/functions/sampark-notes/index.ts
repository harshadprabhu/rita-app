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

async function getToken(cfg: Cfg): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: cfg.refreshToken, client_id: cfg.clientId,
    client_secret: cfg.clientSecret, grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token refresh ${res.status}`);
  return (await res.json()).access_token as string;
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

function normalize(raw: Record<string, unknown>): AppNote {
  const description = String((raw.description as string) || '').replace(/<[^>]+>/g, '').trim();
  const createdBy = (raw.created_by as Record<string, unknown> | undefined) ?? {};
  const authorName = String((createdBy.name as string) || 'Support');
  const authorEmail = (createdBy.email_id as string) ?? null;
  // Notes added by sampark-comment-push are prefixed with "<user> (RITA):" —
  // that's the only reliable way to tell the RITA-side from a genuine
  // Sampark-side technician note, since both end up as Sampark notes.
  const ritaMatch = description.match(/^(.+?)\s+\(RITA\):\s*(.*)$/s);
  const fromRita = !!ritaMatch;
  const body = fromRita ? ritaMatch![2].trim() : description;
  const author = fromRita ? ritaMatch![1].trim() : authorName;
  const createdTime = (raw.created_time as { value?: string } | undefined)?.value;
  const createdAt = createdTime
    ? new Date(Number(createdTime)).toISOString()
    : new Date().toISOString();
  return {
    id: String(raw.id),
    author,
    authorEmail,
    body,
    createdAt,
    fromRita,
    showToRequester: (raw.show_to_requester as boolean) !== false,
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
      const token = await getToken(cfg);
      // Paginate: SDP defaults to 10; ask for 200 explicitly.
      const notesUrl = `${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${r.requestId}/notes?input_data=${encodeURIComponent(JSON.stringify({ list_info: { row_count: 200 } }))}`;
      const fetched = await fetch(notesUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
      });
      const text = await fetched.text();
      if (!fetched.ok) {
        return new Response(JSON.stringify({ error: `sampark ${fetched.status}`, detail: text.slice(0, 500) }), {
          status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const json = JSON.parse(text);
      const rawNotes = (json.notes ?? []) as Record<string, unknown>[];
      // Sampark returns newest-first; give the UI oldest-first so append is natural.
      const notes = rawNotes.map(normalize).reverse();
      return new Response(JSON.stringify({ ok: true, notes }), {
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
      const token = await getToken(cfg);
      // Prefix with `<user> (RITA):` so the normalize() step on any subsequent
      // GET flags it as fromRita — same convention sampark-comment-push used.
      const authoredBody = requester_name ? `${requester_name} (RITA): ${body.trim()}` : body.trim();
      const form = new URLSearchParams({
        input_data: JSON.stringify({ note: { description: authoredBody, show_to_requester: true, mark_first_response: false, notify_technician: true } }),
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
      const raw = json.note ?? {};
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
