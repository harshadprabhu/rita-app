import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Push a RITA ticket into Sampark (ManageEngine SDP) as an incident, then store
// the Sampark request id + display id back on the ticket. Invoked right after a
// ticket is created (and can be re-run to retry a failed push). Body:
//   { "ticket_id": "<uuid>" }  or  { "ticket_number": "RITA-1012" }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

// RITA priority → Sampark priority name.
const PRIORITY_MAP: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Urgent',
};

interface Cfg {
  serviceUrl: string; portal: string; dataCenter: string;
  clientId: string; clientSecret: string; refreshToken: string;
}

async function loadCfg(supabase: ReturnType<typeof createClient>): Promise<Cfg> {
  const { data } = await supabase
    .from('integration_settings')
    .select('sampark_service_url, sampark_portal, sampark_data_center, sampark_enabled')
    .eq('id', 1).maybeSingle();
  const row = (data ?? {}) as Record<string, string | boolean | null>;
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
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status} ${text.slice(0, 200)}`);
  const t = JSON.parse(text).access_token;
  if (!t) throw new Error(`No access_token: ${text.slice(0, 200)}`);
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
    const { ticket_id, ticket_number } = payload as { ticket_id?: string; ticket_number?: string };

    // Load the ticket + requester email.
    let q = supabase.from('tickets').select('id, ticket_number, description, long_description, category, subcategory, priority, requester_id, sampark_request_id');
    q = ticket_id ? q.eq('id', ticket_id) : q.eq('ticket_number', ticket_number ?? '');
    const { data: ticket, error: tErr } = await q.maybeSingle();
    if (tErr) throw tErr;
    if (!ticket) return new Response(JSON.stringify({ ok: false, error: 'ticket_not_found' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if ((ticket as any).sampark_request_id) {
      return new Response(JSON.stringify({ ok: true, already: true, request_id: (ticket as any).sampark_request_id }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: prof } = await supabase.from('profiles').select('id').eq('id', (ticket as any).requester_id).maybeSingle();
    const { data: authUser } = await supabase.auth.admin.getUserById((ticket as any).requester_id);
    const email = authUser?.user?.email ?? '';

    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg);

    const desc = String((ticket as any).long_description || (ticket as any).description || '').trim();
    const subject = (desc.split('\n')[0] || 'RITA ticket').slice(0, 200);

    // Build the request. category/subcategory come FROM Sampark so names match.
    const request: Record<string, unknown> = {
      subject,
      description: desc,
      priority: { name: PRIORITY_MAP[String((ticket as any).priority)] ?? 'Medium' },
    };
    if (email) request.requester = { email_id: email };
    if ((ticket as any).category) request.category = { name: (ticket as any).category };
    if ((ticket as any).subcategory) request.subcategory = { name: (ticket as any).subcategory };

    const url = `${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests`;
    const form = new URLSearchParams({ input_data: JSON.stringify({ request }) });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        Accept: SDP_ACCEPT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, status: res.status, sampark_error: text.slice(0, 500), sent: request }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const json = JSON.parse(text);
    const created = json.request ?? {};
    const reqId = String(created.id ?? '');
    const displayId = String(created.display_id ?? created.id ?? '');
    if (!reqId) throw new Error(`No request id in response: ${text.slice(0, 300)}`);

    await supabase.from('tickets').update({
      sampark_request_id: reqId,
      sampark_display_id: displayId,
      sampark_synced_at: new Date().toISOString(),
    }).eq('id', (ticket as any).id);

    return new Response(JSON.stringify({ ok: true, request_id: reqId, display_id: displayId }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-push]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
