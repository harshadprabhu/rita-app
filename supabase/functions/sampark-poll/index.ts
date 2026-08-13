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
  ticket: { id: string; status: string; sampark_request_id: string; requester_id: string | null; ticket_number: string; assignee_id: string | null },
): Promise<{ statusChanged: boolean; assigneeChanged: boolean; notesAdded: number }> {
  const reqId = ticket.sampark_request_id;
  const detail = await sdpGet(cfg, token, `/requests/${reqId}`);
  const statusName = detail.request?.status?.name as string | undefined;
  let newStatus = ticket.status;
  let newLifecycle: string | null = null;
  if (statusName) {
    const mapped = mapStatus(statusName);
    if (mapped) { newStatus = mapped.status; newLifecycle = mapped.lifecycle; }
  }

  // Match the Sampark technician (name, normalized) against a RITA staff
  // profile — same as the webhook, not restricted to role='technician'
  // since admins/managers/ops managers routinely pick up tickets too.
  let assigneeChanged = false;
  let newAssigneeId = ticket.assignee_id;
  let assigneeName: string | null = null;
  const techName = String(detail.request?.technician?.name ?? '').trim();
  if (techName) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const { data: techs } = await supabase.from('profiles')
      .select('id, display_name').in('role', ['technician', 'admin', 'manager', 'ops_manager']).eq('is_active', true);
    const match = (techs as { id: string; display_name: string }[] | null)?.find(
      (p) => norm(p.display_name) === norm(techName),
    );
    if (match && match.id !== ticket.assignee_id) {
      newAssigneeId = match.id;
      assigneeName = match.display_name;
      assigneeChanged = true;
    }
  }

  // A ticket with an owner in Sampark is work starting, even if Sampark's own
  // status field is still "Open" (technicians don't always flip it right
  // away). Applied every pass against the FINAL resolved assignee — not just
  // on the pass that detects a new assignment — so a later poll re-pulling
  // Sampark's raw "Open" status can't silently revert an earlier bump.
  if (newAssigneeId && newStatus === 'open') {
    newStatus = 'in_progress';
    newLifecycle = 'being_worked_on';
  }
  const statusChanged = newStatus !== ticket.status;

  if (statusChanged || assigneeChanged) {
    await supabase.from('tickets').update({
      ...(statusChanged ? { status: newStatus, lifecycle: newLifecycle } : {}),
      ...(newStatus === 'resolved' && ticket.status !== 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
      ...(assigneeChanged ? { assignee_id: newAssigneeId } : {}),
    }).eq('id', ticket.id);

    // Same Daily Alerts notification the real-time webhook creates — this
    // poll is a fallback for a dropped/misfired trigger, so a ticket caught
    // here should alert the requester exactly like the webhook path does.
    if (ticket.requester_id) {
      const title = assigneeChanged ? 'Technician assigned' : (newStatus === 'resolved' ? 'Ticket resolved' : 'Ticket status updated');
      const displayId = ticket.sampark_display_id ? `#${ticket.sampark_display_id}` : ticket.ticket_number;
      const body = assigneeChanged
        ? `${displayId}: picked up by ${assigneeName}`
        : `${displayId}: moved to ${newStatus.replace(/_/g, ' ')}`;
      const { error: notifErr } = await supabase.from('notifications').insert({
        recipient_id: ticket.requester_id,
        ticket_id: ticket.id,
        title, body,
        type: assigneeChanged ? 'ticket_assigned' : (newStatus === 'resolved' ? 'ticket_resolved' : 'ticket_updated'),
      });
      if (notifErr) console.warn('[sampark-poll] notification insert failed:', notifErr);
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
  return { statusChanged, assigneeChanged, notesAdded };
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
      .select('id, status, sampark_request_id, sampark_display_id, requester_id, ticket_number, assignee_id')
      .not('sampark_request_id', 'is', null)
      .in('status', ['open', 'in_progress'])
      .limit(500);
    if (error) throw error;
    const list = (tickets ?? []) as { id: string; status: string; sampark_request_id: string; requester_id: string | null; ticket_number: string; assignee_id: string | null }[];
    if (!list.length) {
      return new Response(JSON.stringify({ ok: true, polled: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg);

    let statusChanges = 0, assigneeChanges = 0, notes = 0, errors = 0;
    for (const t of list) {
      try {
        const r = await syncOne(supabase, cfg, token, t);
        if (r.statusChanged) statusChanges++;
        if (r.assigneeChanged) assigneeChanges++;
        notes += r.notesAdded;
      } catch { errors++; }
    }

    return new Response(JSON.stringify({ ok: true, polled: list.length, statusChanges, assigneeChanges, notesAdded: notes, errors }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-poll]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
