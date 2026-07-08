import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Safety-net poller for the Sampark inbound sync. The webhook (sampark-webhook)
// is the real-time path; this runs on a cron and re-syncs every still-active
// linked ticket (open / in progress) so a dropped or misfired trigger can't
// leave a status change or technician note stranded. Same pull-and-mirror logic
// as the webhook, applied in bulk.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

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
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return JSON.parse(text);
}

async function syncOne(
  supabase: ReturnType<typeof createClient>, cfg: Cfg, token: string,
  ticket: { id: string; status: string; sampark_request_id: string },
): Promise<{ statusChanged: boolean; notesAdded: number }> {
  const reqId = ticket.sampark_request_id;
  const detail = await sdpGet(cfg, token, `/requests/${reqId}`);
  const statusName = detail.request?.status?.name as string | undefined;
  let statusChanged = false;
  if (statusName) {
    const mapped = mapStatus(statusName);
    if (mapped && mapped.status !== ticket.status) {
      await supabase.from('tickets').update({
        status: mapped.status, lifecycle: mapped.lifecycle,
        ...(mapped.status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
      }).eq('id', ticket.id);
      statusChanged = true;
    }
  }
  let notesAdded = 0;
  try {
    const notesRes = await sdpGet(cfg, token, `/requests/${reqId}/notes`);
    for (const note of (notesRes.notes ?? []) as Record<string, any>[]) {
      if (note.show_to_requester === false) continue;
      const noteId = String(note.id ?? '');
      if (!noteId) continue;
      const author = note.created_by?.name ? `${note.created_by.name} (Sampark)` : 'Sampark';
      const bodyText = String(note.description ?? '').replace(/<[^>]+>/g, '').trim();
      if (!bodyText) continue;
      const { error } = await supabase.from('ticket_comments').insert({
        ticket_id: ticket.id, author_id: null, external_author: author,
        body: bodyText, is_internal: false, sampark_note_id: noteId,
      });
      if (!error) notesAdded++;
    }
  } catch { /* notes optional */ }
  return { statusChanged, notesAdded };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // Active linked tickets only — resolved ones rarely change, so we skip them
    // to bound the API calls.
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('id, status, sampark_request_id')
      .not('sampark_request_id', 'is', null)
      .in('status', ['open', 'in_progress'])
      .limit(500);
    if (error) throw error;
    const list = (tickets ?? []) as { id: string; status: string; sampark_request_id: string }[];
    if (!list.length) {
      return new Response(JSON.stringify({ ok: true, polled: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg);

    let statusChanges = 0, notes = 0, errors = 0;
    for (const t of list) {
      try {
        const r = await syncOne(supabase, cfg, token, t);
        if (r.statusChanged) statusChanges++;
        notes += r.notesAdded;
      } catch { errors++; }
    }

    return new Response(JSON.stringify({ ok: true, polled: list.length, statusChanges, notesAdded: notes, errors }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-poll]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
