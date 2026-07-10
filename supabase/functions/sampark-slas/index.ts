import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Probe: fetch SLA definitions from Sampark (ManageEngine SDP). Tries the known
// v3 SLA endpoints and returns whichever responds, so we can mirror the config
// in RITA. Reuses the same OAuth config as the other sampark-* functions.

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
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
  const body = new URLSearchParams({ refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  const tok = (json as { access_token?: string }).access_token;
  if (!tok) throw new Error(`token exchange returned no access_token: ${JSON.stringify(json)} (refresh tail ${cfg.refreshToken.slice(-6)}, client tail ${cfg.clientId.slice(-6)}, dc ${cfg.dataCenter})`);
  return tok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const cfg = await loadCfg(supabase);

    // One-time helper: exchange a fresh grant code for a refresh token.
    //   /sampark-slas?grant=<code>&redirect=<redirect_uri_used_in_console>
    // Copy the returned `refresh_token` into SAMPARK_REFRESH_TOKEN.
    const url = new URL(req.url);
    const grant = url.searchParams.get('grant');
    if (grant) {
      const redirect = url.searchParams.get('redirect') || '';
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code: grant,
        client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirect,
      });
      const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      return new Response(JSON.stringify(json, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const token = await getToken(cfg);
    // Candidate SLA list endpoints + a known-working sanity check (/requests).
    const paths = ['/requests?input_data=%7B%22list_info%22%3A%7B%22row_count%22%3A1%7D%7D', '/slas', '/sla_definitions', '/admin/slas'];
    const out: Record<string, unknown> = { _tokenLen: token.length, _tokenTail: token.slice(-6) };
    for (const p of paths) {
      try {
        const res = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3${p}`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
        });
        const text = await res.text();
        out[p] = { status: res.status, body: text.slice(0, 4000) };
        if (res.ok) break;
      } catch (e) { out[p] = { error: String(e) }; }
    }
    return new Response(JSON.stringify(out, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
