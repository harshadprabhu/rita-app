import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Safety-net poller for the Sampark inbound sync. The webhook (sampark-webhook)
// is the real-time path; this runs on a cron and re-syncs every still-active
// linked ticket (open / in progress) so a dropped or misfired trigger can't
// leave a status change or technician note stranded. Same pull-and-mirror logic
// as the webhook, applied in bulk.
//
// It also retries the OUTBOUND push for tickets that never got a
// sampark_request_id in the first place (sampark-push failed synchronously
// at ticket-creation time, e.g. Sampark's own AD sync hadn't yet provisioned
// a brand-new SSO user as a requester). Without this, such a ticket is
// permanently stuck: nothing else ever re-attempts the initial push.

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

// Uses integration_settings-cached Zoho access token when still valid ≥5 min,
// refreshes once and stores back otherwise. Shared across every sampark-*
// edge fn + every instance so the OAuth endpoint never gets hammered.
async function getToken(cfg: Cfg, supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: cached } = await supabase
    .from('integration_settings')
    .select('sampark_access_token, sampark_access_expires_at')
    .eq('id', 1).maybeSingle();
  const c = (cached ?? {}) as { sampark_access_token?: string | null; sampark_access_expires_at?: string | null };
  if (c.sampark_access_token && c.sampark_access_expires_at) {
    const ms = new Date(c.sampark_access_expires_at).getTime();
    if (ms - Date.now() > 5 * 60 * 1000) return c.sampark_access_token;
  }
  const body = new URLSearchParams({ refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  const text = await res.text();
  if (!res.ok) throw new Error(`token refresh ${res.status}: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text);
  const t = parsed.access_token as string | undefined;
  if (!t) throw new Error(`no access_token: ${text.slice(0, 200)}`);
  const expiresAt = new Date(Date.now() + (Number(parsed.expires_in) || 3600) * 1000).toISOString();
  await supabase.from('integration_settings').update({ sampark_access_token: t, sampark_access_expires_at: expiresAt }).eq('id', 1);
  return t;
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
  ticket: { id: string; status: string; sampark_request_id: string; sampark_display_id: string | null; requester_id: string | null; ticket_number: string; assignee_id: string | null; sampark_technician_name: string | null },
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
  console.log('[sampark-poll] technician from Sampark:', JSON.stringify(detail.request?.technician), 'for request', reqId);
  if (techName) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const { data: techs } = await supabase.from('profiles')
      .select('id, display_name').in('role', ['technician', 'admin', 'manager', 'ops_manager']).eq('is_active', true);
    console.log('[sampark-poll] RITA staff names:', (techs ?? []).map(p => `"${p.display_name}"`).join(', '));
    const match = (techs as { id: string; display_name: string }[] | null)?.find(
      (p) => norm(p.display_name) === norm(techName),
    );
    if (match) {
      if (match.id !== ticket.assignee_id) {
        newAssigneeId = match.id;
        assigneeName = match.display_name;
        assigneeChanged = true;
        console.log('[sampark-poll] assignment change:', match.display_name, '→', match.id);
      }
    } else {
      console.warn('[sampark-poll] NO MATCH for Sampark technician:', `"${techName}"`);
    }
  }

  if (techName && newStatus === 'open') {
    newStatus = 'in_progress';
    newLifecycle = 'being_worked_on';
  }
  const statusChanged = newStatus !== ticket.status;
  const techNameChanged = techName && techName !== ticket.sampark_technician_name;

  if (statusChanged || assigneeChanged || techNameChanged) {
    await supabase.from('tickets').update({
      ...(statusChanged ? { status: newStatus, lifecycle: newLifecycle } : {}),
      ...(newStatus === 'resolved' && ticket.status !== 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
      ...(assigneeChanged ? { assignee_id: newAssigneeId } : {}),
      ...(techName ? { sampark_technician_name: techName } : {}),
    }).eq('id', ticket.id);

    if (ticket.requester_id) {
      const techAssigned = assigneeChanged || techNameChanged;
      const title = techAssigned ? 'Technician assigned' : (newStatus === 'resolved' ? 'Ticket resolved' : 'Ticket status updated');
      const displayId = ticket.sampark_display_id ? `#${ticket.sampark_display_id}` : 'Ticket';
      const body = techAssigned
        ? `${displayId}: picked up by ${assigneeName ?? techName}`
        : `${displayId}: moved to ${newStatus.replace(/_/g, ' ')}`;
      const { error: notifErr } = await supabase.from('notifications').insert({
        recipient_id: ticket.requester_id,
        ticket_id: ticket.id,
        title, body,
        type: techAssigned ? 'ticket_assigned' : (newStatus === 'resolved' ? 'ticket_resolved' : 'ticket_updated'),
      });
      if (notifErr) console.warn('[sampark-poll] notification insert failed:', notifErr);
    }
  }
  // Notes + REQREPLY conversations. sampark-webhook has the same logic;
  // this cron is the backstop for a dropped webhook fire.
  let notesAdded = 0;
  const emit = async (id: string, author: string, body: string) => {
    if (!ticket.requester_id || !id || !body) return;
    const displayId = ticket.sampark_display_id ? `#${ticket.sampark_display_id}` : 'ticket';
    const { error } = await supabase.from('notifications').insert({
      recipient_id: ticket.requester_id,
      ticket_id: ticket.id,
      title: `${author} commented on ${displayId}`,
      body: body.slice(0, 140),
      type: 'ticket_comment',
      sampark_note_id: id,
    });
    if (!error) notesAdded++;
  };
  try {
    const notesRes = await sdpGet(cfg, token, `/requests/${reqId}/notes`);
    for (const note of (notesRes.notes ?? []) as Record<string, any>[]) {
      if (note.show_to_requester === false) continue;
      const rawBody = String(note.description ?? '').replace(/<[^>]+>/g, '').trim();
      if (!rawBody || /^.+?\s+\(RITA\):/i.test(rawBody)) continue;
      await emit(String(note.id ?? ''), String(note.created_by?.name || 'Support'), rawBody);
    }
  } catch { /* notes optional */ }
  try {
    const convRes = await sdpGet(cfg, token, `/requests/${reqId}/conversations`);
    for (const c of (convRes.conversations ?? []) as Record<string, any>[]) {
      if (c.type !== 'REQREPLY' || c.show_to_requester === false) continue;
      try {
        const detail = await sdpGet(cfg, token, `/requests/${reqId}/notifications/${c.id}`);
        const n = detail.notification;
        if (!n) continue;
        const stripped = String(n.description ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        const q = stripped.search(/^On\s+.+\swrote:$/mi);
        const clean = (q > 0 ? stripped.slice(0, q) : stripped).trim();
        if (!clean) continue;
        await emit(String(c.id), String(n.sender?.name || 'Support'), clean);
      } catch { /* per-reply optional */ }
    }
  } catch { /* conversations optional */ }
  return { statusChanged, assigneeChanged, notesAdded };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Diagnostic: ?probe_notes=<sampark_request_id> dumps the raw notes response
  // from Sampark for a given request, so we can confirm what Sampark's own API
  // is returning (e.g. show_to_requester flag, note count) without any of our
  // insert-side filtering. Doesn't touch the DB.
  const probeReqId = new URL(req.url).searchParams.get('probe_notes');
  if (probeReqId) {
    try {
      const cfg = await loadCfg(supabase);
      const token = await getToken(cfg, supabase);
      // Pull EVERYTHING SDP might store a technician reply as: notes,
      // conversations (email thread), plus the request itself for its
      // resolution field. Whatever the Sampark tech did lands in one of
      // these three places, and the app needs to surface the right one.
      const out: Record<string, unknown> = {};
      try {
        const notesRes = await sdpGet(cfg, token, `/requests/${probeReqId}/notes`);
        out.notes = notesRes.notes ?? notesRes;
      } catch (e) { out.notesError = String(e); }
      try {
        const convRes = await sdpGet(cfg, token, `/requests/${probeReqId}/conversations`);
        out.conversations = convRes.conversations ?? convRes;
        // For each visible REQREPLY, pull the detail to see what body field
        // it exposes — needed to render the actual chat text.
        const details: Record<string, unknown>[] = [];
        // Try every SDP endpoint name that plausibly returns REQREPLY body.
        const c0 = (convRes.conversations ?? []).find((c: any) => c.type === 'REQREPLY');
        if (c0) {
          for (const path of [
            `/requests/${probeReqId}/replies/${c0.id}`,
            `/requests/${probeReqId}/all_conversation/${c0.id}`,
            `/requests/${probeReqId}/all_replies/${c0.id}`,
            `/requests/${probeReqId}/notifications/${c0.id}`,
            `/conversations/${c0.id}`,
            `/replies/${c0.id}`,
          ]) {
            try {
              const d = await sdpGet(cfg, token, path);
              details.push({ path, ok: true, data: d });
              break;
            } catch (e) { details.push({ path, error: String(e).slice(0, 120) }); }
          }
        }
        out.reqreplyDetails = details;
      } catch (e) { out.conversationsError = String(e); }
      try {
        const detail = await sdpGet(cfg, token, `/requests/${probeReqId}`);
        out.resolution = detail.request?.resolution ?? null;
        out.responder = detail.request?.responder ?? null;
        out.first_response_due_by_time = detail.request?.first_response_due_by_time ?? null;
      } catch (e) { out.detailError = String(e); }
      return new Response(JSON.stringify({ ok: true, ...out }, null, 2), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    // Active linked tickets only — resolved ones rarely change, so we skip them
    // to bound the API calls.
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('id, status, sampark_request_id, sampark_display_id, requester_id, ticket_number, assignee_id, sampark_technician_name')
      .not('sampark_request_id', 'is', null)
      .in('status', ['open', 'in_progress'])
      .limit(500);
    if (error) throw error;
    const list = (tickets ?? []) as { id: string; status: string; sampark_request_id: string; requester_id: string | null; ticket_number: string; assignee_id: string | null; sampark_technician_name: string | null }[];
    if (!list.length) {
      return new Response(JSON.stringify({ ok: true, polled: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg, supabase);

    let statusChanges = 0, assigneeChanges = 0, notes = 0, errors = 0;
    for (const t of list) {
      try {
        const r = await syncOne(supabase, cfg, token, t);
        if (r.statusChanged) statusChanges++;
        if (r.assigneeChanged) assigneeChanges++;
        notes += r.notesAdded;
      } catch { errors++; }
    }

    // Retry initial pushes that never went through. Bounded to recent tickets
    // (7 days) so a permanently-unresolvable case (e.g. a deactivated
    // requester) doesn't get retried forever.
    let pushRetried = 0, pushRecovered = 0;
    const { data: unsynced } = await supabase
      .from('tickets')
      .select('id, ticket_number')
      .is('sampark_request_id', null)
      .in('status', ['open', 'in_progress'])
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(50);
    for (const t of (unsynced ?? []) as { id: string; ticket_number: string }[]) {
      pushRetried++;
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sampark-push`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ticket_id: t.id }),
        });
        const j = await res.json().catch(() => ({}));
        if (j.ok) pushRecovered++;
      } catch { /* try again next cron tick */ }
    }

    return new Response(JSON.stringify({
      ok: true, polled: list.length, statusChanges, assigneeChanges, notesAdded: notes, errors,
      pushRetried, pushRecovered,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-poll]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
