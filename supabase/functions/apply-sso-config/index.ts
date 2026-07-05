import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * Push the admin-managed Microsoft SSO (Azure AD) credentials from
 * `integration_settings` into the project's Supabase Auth provider config via
 * the Management API. Called by the admin app right after it saves the SSO
 * form, so the change takes effect without touching the Supabase dashboard.
 *
 * Requires a Management API token as the `MGMT_ACCESS_TOKEN` function secret
 * (named without the `SUPABASE_` prefix — Supabase rejects secrets with that
 * prefix as reserved for its own injected env vars). If it's not set, the
 * settings are still saved (by the caller) — this just reports that the
 * apply step was skipped so the UI can tell the admin.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1. Verify the caller is a signed-in admin.
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  // 2. Load the SSO config (service role — secrets are readable here).
  const { data: cfg } = await admin
    .from('integration_settings')
    .select('azure_client_id, azure_client_secret, azure_tenant_url, azure_enabled')
    .eq('id', 1)
    .maybeSingle();

  const c = (cfg ?? {}) as Record<string, string | boolean | null>;

  // 3. Apply to Supabase Auth via the Management API.
  const mgmtToken = Deno.env.get('MGMT_ACCESS_TOKEN');
  if (!mgmtToken) {
    return json({
      applied: false,
      reason: 'management_token_missing',
      message: 'Saved. Set MGMT_ACCESS_TOKEN to auto-apply to Supabase Auth.',
    });
  }

  const ref = new URL(SUPABASE_URL).host.split('.')[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_azure_enabled:   !!c.azure_enabled,
      external_azure_client_id: (c.azure_client_id as string) ?? '',
      external_azure_secret:    (c.azure_client_secret as string) ?? '',
      external_azure_url:       (c.azure_tenant_url as string) ?? '',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return json({ applied: false, reason: 'management_api_error', status: res.status, message: text.slice(0, 300) }, 502);
  }

  return json({ applied: true, message: 'Microsoft SSO configuration applied.' });
});
