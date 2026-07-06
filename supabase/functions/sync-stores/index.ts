import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Daily sync of the store master from D365 F&O into the `stores` table, which
// the onboarding store picker and broadcasts targeting both read. Reuses the
// same D365 app-registration credentials as sync-gold-rate (integration_settings
// row, env-var fallback).
//
// D365 exposes stores through a few possible OData data entities depending on
// the environment/licensing, and this is a customised (PwC) instance, so we try
// a list of candidates and map fields defensively — logging the first row's
// keys so the mapping can be tightened once we see the real shape in the logs.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const D365_DEFAULT_BASE = 'https://novel.operations.dynamics.com';

// OData store entities to try, in order. First one that returns rows wins.
const STORE_ENTITIES = ['RetailStores', 'RetailChannels', 'OMOperatingUnits'];

interface D365Config {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  resourceUrl: string;
}

interface StoreRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  region: string | null;
  retail_channel_id: string | null;
  is_active: boolean;
}

async function loadD365Config(supabase: ReturnType<typeof createClient>): Promise<D365Config> {
  const { data } = await supabase
    .from('integration_settings')
    .select('d365_client_id, d365_client_secret, d365_tenant_id, d365_resource_url')
    .eq('id', 1)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, string | null>;
  return {
    clientId:     row.d365_client_id     || Deno.env.get('D365_CLIENT_ID')     || '',
    clientSecret: row.d365_client_secret || Deno.env.get('D365_CLIENT_SECRET') || '',
    tenantId:     row.d365_tenant_id     || Deno.env.get('D365_TENANT_ID')     || '',
    resourceUrl:  row.d365_resource_url  || D365_DEFAULT_BASE,
  };
}

async function getD365Token(cfg: D365Config): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenantId) {
    throw new Error('D365 credentials not configured');
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'client_credentials',
    resource: cfg.resourceUrl,
  });
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/token`, {
    method: 'POST',
    body,
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status}`);
  const { access_token } = await res.json();
  return access_token as string;
}

const str = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');

// Pull a value from a row by trying several candidate field names (D365 entity
// field names vary by entity and environment).
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v;
  }
  return '';
}

// D365 store names follow a "City-Area" convention (e.g. "Ahmedabad-CG Rd",
// "Agra-Anjani Cinema_FR"), so when the entity's own address fields are empty
// we take the city as the segment before the first '-' (dropping any '_FR'
// franchise suffix). Purely a fallback — a real AddressCity always wins.
function cityFromName(name: string): string | null {
  const head = name.split('-')[0].split('_')[0].trim();
  return head && head !== name ? head : null;
}

function mapStore(row: Record<string, unknown>): StoreRow | null {
  const code = pick(row, [
    'OMOperatingUnitNumber', 'StoreNumber', 'RetailChannelId', 'InventLocationId',
    'ChannelId', 'StoreId', 'OperatingUnitNumber',
  ]);
  const name = pick(row, [
    'RetailChannelName', 'StoreName', 'Name', 'OMOperatingUnitName', 'ChannelName',
  ]) || code;
  if (!code) return null;
  const city = pick(row, ['AddressCity', 'City']) || cityFromName(name);
  return {
    id: code,
    code,
    name,
    city: city || null,
    region: pick(row, ['AddressState', 'State', 'AddressCountryRegionId', 'Region']) || null,
    // The channel/warehouse code (NS####) — the key worker address books use to
    // point at a store, distinct from the OMOperatingUnitNumber used as `code`.
    retail_channel_id: pick(row, ['RetailChannelId', 'InventLocationId', 'OMOperatingUnitId']) || null,
    is_active: true,
  };
}

async function fetchStores(token: string, cfg: D365Config): Promise<StoreRow[]> {
  for (const entity of STORE_ENTITIES) {
    const url = `${cfg.resourceUrl}/data/${entity}?$top=2000`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch (e) {
      console.warn(`[sync-stores] ${entity} fetch error:`, e);
      continue;
    }
    if (!res.ok) {
      console.warn(`[sync-stores] ${entity} HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    const rows = (json?.value ?? []) as Record<string, unknown>[];
    if (!rows.length) {
      console.warn(`[sync-stores] ${entity} returned 0 rows`);
      continue;
    }
    // Log the shape of the first row once, so the field mapping can be verified.
    console.log(`[sync-stores] ${entity} keys:`, Object.keys(rows[0]).slice(0, 40).join(', '));

    const mapped: StoreRow[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const s = mapStore(r);
      if (s && !seen.has(s.id)) { seen.add(s.id); mapped.push(s); }
    }
    if (mapped.length) {
      console.log(`[sync-stores] mapped ${mapped.length} stores from ${entity}`);
      return mapped;
    }
    console.warn(`[sync-stores] ${entity} rows had no usable store code; sample:`, JSON.stringify(rows[0]).slice(0, 400));
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const cfg = await loadD365Config(supabase);
    const token = await getD365Token(cfg);
    const stores = await fetchStores(token, cfg);

    if (!stores.length) {
      // Never wipe the existing master on an empty/failed pull.
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_stores_returned', synced: 0 }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const { error } = await supabase.from('stores').upsert(stores, { onConflict: 'id' });
    if (error) throw error;

    // Deactivate D365 stores no longer present in the feed (only safe because we
    // got a healthy, non-empty pull above). Reactivation happens via the upsert.
    // Guarded to purely-numeric codes so manually-seeded non-retail entries like
    // the head office (HO-PRABHADEVI) are never touched by the sync.
    const activeIds = stores.map((s) => s.id);
    await supabase
      .from('stores')
      .update({ is_active: false })
      .eq('is_active', true)
      .filter('code', 'match', '^[0-9]+$')
      .not('id', 'in', `(${activeIds.map((id) => `"${id}"`).join(',')})`);

    return new Response(
      JSON.stringify({ ok: true, synced: stores.length }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[sync-stores] error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
