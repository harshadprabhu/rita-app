import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Check whether an email is a valid REQUESTER on Sampark (ManageEngine SDP).
// RITA accounts are auto-provisioned from Azure AD/SSO the instant someone signs
// in, but Sampark is not — so an AD ID that has never been provisioned as a
// Sampark requester cannot have a request filed against it, and any ticket it
// raises silently fails to register on Sampark. This endpoint lets the client
// warn such a user (before they log a ticket) to re-login with the common store
// ID that exists on both AD and Sampark. It only READS; it never provisions.
//
// Body: { "email": "someone@adityabirla.com" }
// Returns: { ok: true, exists: boolean, email }  (fail-open: callers treat any
// non-ok / error as "assume valid" so a transient Sampark hiccup never nags
// everyone.)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

interface Cfg {
  serviceUrl: string; portal: string; dataCenter: string;
  clientId: string; clientSecret: string; refreshToken: string;
}

async function loadCfg(supabase: ReturnType<typeof createClient>): Promise<Cfg> {
  const { data } = await supabase
    .from('integration_settings')
    .select('sampark_service_url, sampark_portal, sampark_data_center')
    .eq('id', 1).maybeSingle();
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

// Shares the integration_settings-cached access token with the other sampark-*
// functions; refreshes only when ≤5 min remain.
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
  const body = new URLSearchParams({
    refresh_token: cfg.refreshToken, client_id: cfg.clientId,
    client_secret: cfg.clientSecret, grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status} ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text);
  const t = parsed.access_token;
  if (!t) throw new Error(`No access_token: ${text.slice(0, 200)}`);
  const expiresAt = new Date(Date.now() + (Number(parsed.expires_in) || 3600) * 1000).toISOString();
  await supabase.from('integration_settings').update({ sampark_access_token: t, sampark_access_expires_at: expiresAt }).eq('id', 1);
  return t;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const payload = await req.json().catch(() => ({}));
    const email = String((payload as { email?: string }).email || '').trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: 'email_required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg, supabase);

    // SDP v3: filter requesters by email_id. Same requester scope the push
    // function already uses to (auto-)create requesters, so no extra OAuth
    // scope is needed beyond what Sampark integration already has.
    const listInfo = {
      list_info: {
        row_count: 1,
        search_criteria: { field: 'email_id', condition: 'is', value: email },
      },
    };
    const url = `${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requesters?input_data=${encodeURIComponent(JSON.stringify(listInfo))}`;
    const r = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
    });
    const text = await r.text();
    if (!r.ok) {
      // Fail-open on the client, but report the reason for debugging.
      return new Response(JSON.stringify({ ok: false, error: 'sampark_query_failed', status: r.status, detail: text.slice(0, 300) }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const json = JSON.parse(text);
    const list = (json.requesters ?? []) as Array<{ email_id?: string }>;
    const exists = list.some((x) => String(x.email_id || '').trim().toLowerCase() === email);

    return new Response(JSON.stringify({ ok: true, exists, email }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-check-requester]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
