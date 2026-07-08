import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Download RITA-eligible users from Entra (Azure AD) via Microsoft Graph —
// specifically the members of the configured security groups (NJ_Regular
// Profile / NJ_Store Tablets). Replaces the old D365 worker sync. On first SSO
// sign-in, ensureProfile matches the signed-in email against this table to
// pre-fill the profile (name, phone; store is derived from the AD login id).
//
// Uses the SSO Azure app's client credentials for an app-only Graph token, so
// the app needs the GroupMember.Read.All (or Group.Read.All) APPLICATION
// permission with admin consent. Invoke with ?probe=1 to check the token + list
// matching groups without syncing.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Security groups whose members are RITA users.
const GROUP_NAMES = ['NJ_Regular Profile', 'NJ_Store Tablets'];

interface AzureCfg { clientId: string; clientSecret: string; tenantId: string; }

async function loadCfg(supabase: ReturnType<typeof createClient>): Promise<AzureCfg> {
  const { data } = await supabase
    .from('integration_settings')
    .select('azure_client_id, azure_client_secret, azure_tenant_url')
    .eq('id', 1).maybeSingle();
  const row = (data ?? {}) as Record<string, string | null>;
  // tenant id is the GUID segment of the tenant URL.
  const tenantId = (row.azure_tenant_url ?? '').match(/[0-9a-f-]{36}/i)?.[0] ?? '';
  return {
    clientId: row.azure_client_id ?? '',
    clientSecret: row.azure_client_secret ?? '',
    tenantId,
  };
}

async function getGraphToken(cfg: AzureCfg): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenantId) {
    throw new Error('Azure app credentials not configured');
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST', body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph token failed: ${res.status} ${text.slice(0, 250)}`);
  return JSON.parse(text).access_token as string;
}

async function graphGet(token: string, url: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url.replace(/https:\/\/graph.microsoft.com\/v1.0/, '')} → ${res.status}: ${text.slice(0, 250)}`);
  return JSON.parse(text);
}

// Follow @odata.nextLink pagination, collecting all values.
async function graphGetAll(token: string, url: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = url;
  while (next) {
    const page = await graphGet(token, next);
    out.push(...(page.value ?? []));
    next = page['@odata.nextLink'] ?? null;
  }
  return out;
}

interface UserRow { email: string; name: string | null; phone: string | null; store_id: string | null; }

function mapUser(u: Record<string, any>): UserRow | null {
  const email = String(u.mail || u.userPrincipalName || '').toLowerCase();
  if (!email || !email.includes('@')) return null;
  const phone = u.mobilePhone || (Array.isArray(u.businessPhones) ? u.businessPhones[0] : '') || null;
  return { email, name: u.displayName || null, phone, store_id: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const probe = new URL(req.url).searchParams.get('probe') === '1';

  try {
    const cfg = await loadCfg(supabase);
    const token = await getGraphToken(cfg);

    // --- Probe: confirm the token works + show the NJ_* groups it can see. ---
    if (probe) {
      const report: Record<string, unknown> = { tokenOk: true };
      try {
        const groups = await graphGetAll(token, `https://graph.microsoft.com/v1.0/groups?$filter=${encodeURIComponent("startswith(displayName,'NJ')")}&$select=id,displayName`);
        report.groups = groups.map((g) => ({ id: g.id, name: g.displayName }));
      } catch (e) {
        report.groupsError = e instanceof Error ? e.message : String(e);
      }
      return new Response(JSON.stringify(report, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // --- Sync: resolve each group by name, collect its user members, upsert. ---
    const seen = new Set<string>();
    const rows: UserRow[] = [];
    for (const name of GROUP_NAMES) {
      const groups = await graphGetAll(token, `https://graph.microsoft.com/v1.0/groups?$filter=${encodeURIComponent(`displayName eq '${name}'`)}&$select=id`);
      for (const g of groups) {
        const members = await graphGetAll(
          token,
          `https://graph.microsoft.com/v1.0/groups/${g.id}/transitiveMembers/microsoft.graph.user?$select=displayName,userPrincipalName,mail,mobilePhone,businessPhones,accountEnabled&$top=999`,
        );
        for (const m of members) {
          if (m.accountEnabled === false) continue;
          const row = mapUser(m);
          if (row && !seen.has(row.email)) { seen.add(row.email); rows.push(row); }
        }
      }
    }

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_members', synced: 0 }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { error } = await supabase.from('workers').upsert(rows, { onConflict: 'email' });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, synced: rows.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sync-users]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
