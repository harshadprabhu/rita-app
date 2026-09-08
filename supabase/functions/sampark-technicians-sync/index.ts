import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Sync Sampark's licensed technician roster into public.sampark_technicians,
// pre-matching each to a RITA account by email (so Connect can DM them) and
// capturing whatever availability signal the record carries.
//
// GATED: /technicians needs the SDPOnDemand.users scope on the Zoho token.
// Until that's added this returns { ok:false, blocked:'scope' } and writes
// nothing — Connect keeps its current behavior. The moment the scope lands,
// this populates the table and Connect switches to the Sampark roster.
//
// The response includes `sample` (the raw fields of the first technician) so
// the real "online/available" field can be identified and `deriveOnline`
// tightened against live data.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
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

// Best-effort read of an "online/available" signal from a Sampark technician
// record. SDP has no documented presence boolean, so we probe the likely
// shapes and record which one fired. Refine once real /technicians data is in.
function deriveOnline(rec: Record<string, any>): { online: boolean; source: string | null } {
  const truthy = (v: any) => v === true || v === 'true' || v === 1 || v === '1';
  const candidates: [string, any][] = [
    ['is_online', rec.is_online],
    ['online', rec.online],
    ['available', rec.available],
    ['is_available', rec.is_available],
    ['presence', rec.presence?.online ?? rec.presence?.status],
    ['availability.name', rec.availability?.name],
    ['status.online', rec.status?.online],
  ];
  for (const [key, val] of candidates) {
    if (val === undefined || val === null) continue;
    if (typeof val === 'string') {
      const s = val.toLowerCase();
      if (['online', 'available', 'active', 'on duty', 'on-duty'].includes(s)) return { online: true, source: key };
      if (['offline', 'away', 'unavailable', 'busy'].includes(s)) return { online: false, source: key };
    }
    if (truthy(val)) return { online: true, source: key };
  }
  return { online: false, source: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const cfg = await loadCfg(supabase);
    const token = await getToken(cfg, supabase);

    // 1) Page through Sampark's technician roster.
    const all: Record<string, any>[] = [];
    let start = 1; const rows = 100;
    for (let page = 0; page < 20; page++) {
      const input = encodeURIComponent(JSON.stringify({ list_info: { row_count: rows, start_index: start } }));
      const r = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/technicians?input_data=${input}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
      });
      if (r.status === 401 || r.status === 403) {
        return new Response(JSON.stringify({ ok: false, blocked: 'scope', message: 'Sampark /technicians denied — add the SDPOnDemand.users scope to SAMPARK_REFRESH_TOKEN.' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const text = await r.text();
      if (!r.ok) throw new Error(`GET /technicians ${r.status}: ${text.slice(0, 160)}`);
      const json = JSON.parse(text);
      const batch = (json.technicians ?? []) as Record<string, any>[];
      all.push(...batch);
      if (batch.length < rows) break;
      start += rows;
    }

    // 2) Build email -> RITA profile id map for staff who can be technicians.
    const { data: profs } = await supabase.from('profiles')
      .select('id').in('role', ['technician', 'admin', 'manager', 'ops_manager']).eq('is_active', true);
    const emailToRita = new Map<string, string>();
    for (const p of (profs ?? []) as { id: string }[]) {
      const { data: au } = await supabase.auth.admin.getUserById(p.id);
      const em = au?.user?.email?.toLowerCase().trim();
      if (em) emailToRita.set(em, p.id);
    }

    // 3) Upsert each Sampark technician.
    const nowIso = new Date().toISOString();
    let matched = 0;
    const rowsToUpsert = all.map((rec) => {
      const email = String(rec.email_id ?? rec.email ?? '').toLowerCase().trim() || null;
      const ritaId = email ? emailToRita.get(email) ?? null : null;
      if (ritaId) matched++;
      const { online, source } = deriveOnline(rec);
      return {
        sampark_id: String(rec.id ?? rec.user_id ?? email ?? crypto.randomUUID()),
        name: String(rec.name ?? rec.first_name ?? 'Technician'),
        email,
        rita_profile_id: ritaId,
        online,
        online_source: source,
        raw: rec,
        last_synced_at: nowIso,
      };
    });
    if (rowsToUpsert.length > 0) {
      const { error } = await supabase.from('sampark_technicians').upsert(rowsToUpsert, { onConflict: 'sampark_id' });
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      ok: true,
      total: all.length,
      matchedToRita: matched,
      onlineFieldDetected: rowsToUpsert.find((r) => r.online_source)?.online_source ?? null,
      sample: all[0] ? Object.keys(all[0]) : [],   // field names, to identify the availability field
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-technicians-sync]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
