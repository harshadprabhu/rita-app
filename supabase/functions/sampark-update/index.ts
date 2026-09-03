import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// RITA → Sampark write-back. Mirrors a technician's RITA-side action (claim,
// resolve, reassign, status change) onto the linked Sampark request via
// PUT /requests/{id}. This is the outbound counterpart to sampark-webhook/
// sampark-poll (which sync Sampark → RITA). Body:
//   { ticket_id, status?, technician_email?, technician_name? }
// Any subset; at least one of status / technician must be present.
//
// Echo note: setting status here will bounce back through the inbound sync,
// but that path only writes when the value actually differs, so it converges
// without a loop.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

// RITA status → Sampark status name. Sampark's picklist is Open / In Progress
// / On Hold / Resolved / Closed (confirmed via historical requests).
const STATUS_MAP: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Closed',
};

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

// Shared DB-cached Zoho token — refresh only when ≤5 min left.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const payload = await req.json().catch(() => ({}));
    let { ticket_id, status, technician_email, technician_name } = payload as {
      ticket_id?: string; status?: string; technician_email?: string; technician_name?: string;
    };
    const { technician_id } = payload as { technician_id?: string };
    if (!ticket_id) return new Response(JSON.stringify({ error: 'ticket_id required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // Resolve a RITA technician profile → the email/name Sampark matches on.
    // The client can't read auth emails; the service role here can.
    if (technician_id && !technician_email) {
      const { data: authUser } = await supabase.auth.admin.getUserById(technician_id);
      technician_email = authUser?.user?.email ?? undefined;
      if (!technician_name) {
        const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', technician_id).maybeSingle();
        technician_name = (prof as { display_name?: string } | null)?.display_name ?? undefined;
      }
    }

    const { data: ticket } = await supabase.from('tickets')
      .select('sampark_request_id').eq('id', ticket_id).maybeSingle();
    const requestId = (ticket as { sampark_request_id?: string } | null)?.sampark_request_id;
    if (!requestId) {
      // Not yet synced to Sampark — nothing to write back. Not an error; the
      // RITA-side change stands and the initial push will carry current state.
      return new Response(JSON.stringify({ ok: true, skipped: 'no_sampark_request_id' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const request: Record<string, unknown> = {};
    if (status && STATUS_MAP[status]) request.status = { name: STATUS_MAP[status] };
    if (technician_email) request.technician = { email_id: technician_email };
    else if (technician_name) request.technician = { name: technician_name };
    if (Object.keys(request).length === 0) {
      return new Response(JSON.stringify({ error: 'nothing to update (status or technician required)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg, supabase);
    const res = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${requestId}`, {
      method: 'PUT',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ input_data: JSON.stringify({ request }) }),
    });
    const text = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, status: res.status, detail: text.slice(0, 400), sent: request }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const json = JSON.parse(text);
    const r = json.request ?? {};
    return new Response(JSON.stringify({
      ok: true,
      request_id: requestId,
      applied: { status: (r.status || {}).name ?? null, technician: (r.technician || {}).name ?? null },
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-update]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
