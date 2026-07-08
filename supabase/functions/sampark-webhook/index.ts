import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Inbound real-time sync from Sampark (ManageEngine SDP). A Custom Trigger in
// Sampark POSTs here whenever a request is edited or a note is added; we then
// PULL the authoritative request detail + notes from Sampark and mirror the
// status change + any new technician notes onto the matching RITA ticket.
//
// Security: the trigger must include ?token=<SAMPARK_WEBHOOK_SECRET>. Kept a
// pull-on-signal design so we don't depend on fragile note-content templating
// in the trigger payload — the trigger only needs to send the request id.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

// Sampark status name → RITA status + lifecycle.
function mapStatus(name: string): { status: string; lifecycle: string } | null {
  const n = name.toLowerCase();
  if (n.includes('resolved')) return { status: 'resolved', lifecycle: 'resolved' };
  if (n.includes('closed')) return { status: 'resolved', lifecycle: 'closed' };
  if (n === 'open' || n.includes('new')) return { status: 'open', lifecycle: 'open' };
  if (n.includes('hold') || n.includes('pending')) return { status: 'in_progress', lifecycle: 'pending_your_action' };
  return { status: 'in_progress', lifecycle: 'being_worked_on' };
}

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
  const body = new URLSearchParams({ refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token refresh ${res.status}`);
  return (await res.json()).access_token as string;
}

async function sdpGet(cfg: Cfg, token: string, path: string): Promise<any> {
  const res = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token || token !== Deno.env.get('SAMPARK_WEBHOOK_SECRET')) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // The trigger sends the request id (accept a few field names / nesting).
    const payload = await req.json().catch(() => ({}));
    const requestId = String(
      payload.request_id ?? payload.id ?? payload.request?.id ?? url.searchParams.get('request_id') ?? '',
    ).trim();
    if (!requestId) return new Response(JSON.stringify({ ok: false, error: 'no_request_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // Find the RITA ticket linked to this Sampark request.
    const { data: ticket } = await supabase.from('tickets').select('id, status').eq('sampark_request_id', requestId).maybeSingle();
    if (!ticket) return new Response(JSON.stringify({ ok: true, ignored: 'no_linked_ticket', requestId }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    const ticketId = (ticket as any).id;

    const cfg = await loadCfg(supabase);
    const accessToken = await getToken(cfg);

    // 1. Pull the request → sync status.
    const reqDetail = await sdpGet(cfg, accessToken, `/requests/${requestId}`);
    const statusName = reqDetail.request?.status?.name as string | undefined;
    let statusChanged = false;
    if (statusName) {
      const mapped = mapStatus(statusName);
      if (mapped && mapped.status !== (ticket as any).status) {
        await supabase.from('tickets').update({
          status: mapped.status, lifecycle: mapped.lifecycle,
          ...(mapped.status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        }).eq('id', ticketId);
        statusChanged = true;
      }
    }

    // 2. Pull notes → insert any not already synced. Only public (requester-
    //    visible) notes flow back to the RITA ticket thread.
    let notesAdded = 0;
    try {
      const notesRes = await sdpGet(cfg, accessToken, `/requests/${requestId}/notes`);
      const notes = (notesRes.notes ?? []) as Record<string, any>[];
      for (const note of notes) {
        if (note.show_to_requester === false) continue;
        const noteId = String(note.id ?? '');
        if (!noteId) continue;
        const author = note.created_by?.name ? `${note.created_by.name} (Sampark)` : 'Sampark';
        const bodyText = String(note.description ?? '').replace(/<[^>]+>/g, '').trim();
        if (!bodyText) continue;
        const { error } = await supabase.from('ticket_comments').insert({
          ticket_id: ticketId, author_id: null, external_author: author,
          body: bodyText, is_internal: false, sampark_note_id: noteId,
        });
        if (!error) notesAdded++; // unique index on sampark_note_id makes dupes a no-op error
      }
    } catch (e) {
      console.warn('[sampark-webhook] notes pull failed:', e);
    }

    return new Response(JSON.stringify({ ok: true, ticketId, statusChanged, notesAdded }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-webhook]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
