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

// Uses integration_settings-cached access token; refresh only when ≤5 min left.
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
    const { data: ticket } = await supabase.from('tickets')
      .select('id, status, lifecycle, assignee_id, requester_id, ticket_number, sampark_display_id, sampark_technician_name')
      .eq('sampark_request_id', requestId).maybeSingle();
    if (!ticket) return new Response(JSON.stringify({ ok: true, ignored: 'no_linked_ticket', requestId }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    const t = ticket as {
      id: string; status: string; lifecycle: string; assignee_id: string | null;
      requester_id: string | null; ticket_number: string; sampark_technician_name: string | null;
    };
    const ticketId = t.id;

    const cfg = await loadCfg(supabase);
    const accessToken = await getToken(cfg, supabase);

    // 1. Pull the request → sync status + technician assignment.
    const reqDetail = await sdpGet(cfg, accessToken, `/requests/${requestId}`);
    const statusName = reqDetail.request?.status?.name as string | undefined;

    let newStatus = t.status;
    let newLifecycle = t.lifecycle;
    if (statusName) {
      const mapped = mapStatus(statusName);
      if (mapped) { newStatus = mapped.status; newLifecycle = mapped.lifecycle; }
    }

    // Match the Sampark technician (name, normalized) against a RITA staff
    // profile, so self-assignment in Sampark reflects who owns the ticket here.
    // Not restricted to role='technician' — admins/managers/ops managers
    // routinely pick up tickets in Sampark too (confirmed live: an admin
    // self-assigning never matched under the technician-only filter).
    let assigneeChanged = false;
    let newAssigneeId = t.assignee_id;
    let assigneeName: string | null = null;
    const techName = String(reqDetail.request?.technician?.name ?? '').trim();
    console.log('[sampark-webhook] technician from Sampark:', JSON.stringify(reqDetail.request?.technician));
    if (techName) {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const { data: techs } = await supabase.from('profiles')
        .select('id, display_name').in('role', ['technician', 'admin', 'manager', 'ops_manager']).eq('is_active', true);
      console.log('[sampark-webhook] RITA staff names:', (techs ?? []).map(p => `"${p.display_name}"`).join(', '));
      console.log('[sampark-webhook] looking for normalized:', `"${norm(techName)}"`);
      const match = (techs as { id: string; display_name: string }[] | null)?.find(
        (p) => norm(p.display_name) === norm(techName),
      );
      if (match) {
        console.log('[sampark-webhook] matched to:', match.display_name, match.id, 'current assignee:', t.assignee_id);
        if (match.id !== t.assignee_id) {
          newAssigneeId = match.id;
          assigneeName = match.display_name;
          assigneeChanged = true;
        }
      } else {
        console.warn('[sampark-webhook] NO MATCH for Sampark technician:', `"${techName}"`);
      }
    } else {
      console.log('[sampark-webhook] no technician assigned in Sampark for request', requestId);
    }

    // A ticket with an owner in Sampark is work starting, even if Sampark's
    // own status field is still "Open". Applied every pass against the FINAL
    // resolved assignee — not just on the pass that detects a new assignment
    // — so a later poll/webhook re-pulling Sampark's raw "Open" status can't
    // silently revert an earlier bump.
    if ((newAssigneeId || techName) && newStatus === 'open') {
      newStatus = 'in_progress';
      newLifecycle = 'being_worked_on';
    }
    const statusChanged = newStatus !== t.status;

    const techNameChanged = techName && techName !== (t as any).sampark_technician_name;

    if (statusChanged || assigneeChanged || techNameChanged) {
      await supabase.from('tickets').update({
        ...(statusChanged ? { status: newStatus, lifecycle: newLifecycle } : {}),
        ...(newStatus === 'resolved' && t.status !== 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        ...(assigneeChanged ? { assignee_id: newAssigneeId } : {}),
        ...(techName ? { sampark_technician_name: techName } : {}),
      }).eq('id', ticketId);

      // Alert the requester in-app — the `notification_push` DB trigger fires an
      // OS push automatically on this insert.
      if (t.requester_id) {
        const techAssigned = assigneeChanged || techNameChanged;
        const title = techAssigned ? 'Technician assigned' : (newStatus === 'resolved' ? 'Ticket resolved' : 'Ticket status updated');
        const displayId = t.sampark_display_id ? `#${t.sampark_display_id}` : 'Ticket';
        const body = techAssigned
          ? `${displayId}: picked up by ${assigneeName ?? techName}`
          : `${displayId}: moved to ${newStatus.replace(/_/g, ' ')}`;
        const { error: notifErr } = await supabase.from('notifications').insert({
          recipient_id: t.requester_id,
          ticket_id: ticketId,
          title,
          body,
          type: techAssigned ? 'ticket_assigned' : (newStatus === 'resolved' ? 'ticket_resolved' : 'ticket_updated'),
        });
        if (notifErr) console.warn('[sampark-webhook] notification insert failed:', notifErr);
      }
    }

    // 2. Pull BOTH /notes and /conversations (REQREPLY items live there,
    //    not in /notes — Sampark's technicians reply via email more often
    //    than typing on the Notes tab). Emit a notification row for each
    //    new visible message so a push lands on the requester's phone.
    //    Bodies are NEVER stored in RITA (Sampark is sole source of truth).
    let notesAdded = 0;
    const emit = async (id: string, author: string, body: string) => {
      if (!t.requester_id || !id || !body) return;
      const displayId = t.sampark_display_id ? `#${t.sampark_display_id}` : 'ticket';
      const { error } = await supabase.from('notifications').insert({
        recipient_id: t.requester_id,
        ticket_id: ticketId,
        title: `${author} commented on ${displayId}`,
        body: body.slice(0, 140),
        type: 'ticket_comment',
        sampark_note_id: id,
      });
      if (!error) notesAdded++;
    };
    try {
      const notesRes = await sdpGet(cfg, accessToken, `/requests/${requestId}/notes`);
      for (const note of (notesRes.notes ?? []) as Record<string, any>[]) {
        if (note.show_to_requester === false) continue;
        const rawBody = String(note.description ?? '').replace(/<[^>]+>/g, '').trim();
        if (!rawBody || /^.+?\s+\(RITA\):/i.test(rawBody)) continue;
        await emit(String(note.id ?? ''), String(note.created_by?.name || 'Support'), rawBody);
      }
    } catch (e) { console.warn('[sampark-webhook] notes pull failed:', e); }
    try {
      const convRes = await sdpGet(cfg, accessToken, `/requests/${requestId}/conversations`);
      for (const c of (convRes.conversations ?? []) as Record<string, any>[]) {
        if (c.type !== 'REQREPLY' || c.show_to_requester === false) continue;
        try {
          const detail = await sdpGet(cfg, accessToken, `/requests/${requestId}/notifications/${c.id}`);
          const n = detail.notification;
          if (!n) continue;
          const stripped = String(n.description ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
          const q = stripped.search(/^On\s+.+\swrote:$/mi);
          const clean = (q > 0 ? stripped.slice(0, q) : stripped).trim();
          if (!clean) continue;
          await emit(String(c.id), String(n.sender?.name || 'Support'), clean);
        } catch (e) { console.warn('[sampark-webhook] reply detail failed:', c.id, e); }
      }
    } catch (e) { console.warn('[sampark-webhook] conversations pull failed:', e); }

    return new Response(JSON.stringify({ ok: true, ticketId, statusChanged, assigneeChanged, notesAdded, samparkTechnician: techName || null, matchedAssignee: assigneeName }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-webhook]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
