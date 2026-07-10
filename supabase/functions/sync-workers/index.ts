import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Daily sync of the D365 worker master into a `workers` staging table, keyed by
// email (the Azure AD sign-in identity). On first SSO sign-in the app matches a
// worker by email and fills the profile (name, phone, store) from it — so no
// manual sign-up is needed. Reuses the sync-gold-rate D365 credentials.
//
// D365 worker/HR data spreads across a few entities and this is a customised
// (PwC) instance, so field/entity names are uncertain. Invoke with ?probe=1 to
// return the discovered entity shapes (keys + a redacted sample row) instead of
// syncing, so the mapping below can be verified against the real schema.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const D365_DEFAULT_BASE = 'https://novel.operations.dynamics.com';

// Candidate worker entities to probe, in order.
const WORKER_ENTITIES = [
  'Workers',
  'Employees',
  'RetailStoreAddressBooks',
  'RetailStoreAddressBook',
  'OMOperatingUnitAddressBooks',
  'WorkerPostalAddresses',
  'HcmWorkerContactInformations',
  'EmployeeAddressBookEntities',
];

interface D365Config {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  resourceUrl: string;
}

interface WorkerRow {
  email: string;
  personnel_number: string | null;
  name: string | null;
  phone: string | null;
  store_id: string | null;
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

async function fetchEntity(
  token: string,
  cfg: D365Config,
  entity: string,
  top = 5,
): Promise<Record<string, unknown>[] | { error: string }> {
  const url = `${cfg.resourceUrl}/data/${entity}?$top=${top}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return (json?.value ?? []) as Record<string, unknown>[];
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Redact obvious PII in a sample row so probe output can be shared safely while
// still revealing field names + value shapes.
function redact(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.length > 3) out[k] = v.slice(0, 2) + '…';
    else out[k] = v;
  }
  return out;
}

const str = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = str(row[k]); if (v) return v; }
  return '';
}

/**
 * Resolve a worker's store from D365's address-book model:
 *   Workers.AddressBooks is a ";"-separated list of book names (e.g.
 *   "NE0001;NEC001;NS0005"); RetailStoreAddressBooks maps an Employee-type
 *   AddressBookName to a store's RetailChannelId. We match the worker's books
 *   against that map, then translate the channel id to our stores.id via the
 *   channel→store lookup built from the stores table.
 *
 * Returns our stores.id, or null when the worker has no matching store book.
 */
function resolveStoreId(
  addressBooks: string,
  bookToChannel: Map<string, string>,
  channelToStore: Map<string, string>,
): string | null {
  for (const book of addressBooks.split(';').map((b) => b.trim()).filter(Boolean)) {
    const channel = bookToChannel.get(book);
    if (channel) {
      const store = channelToStore.get(channel);
      if (store) return store;
    }
  }
  return null;
}

function mapWorker(
  row: Record<string, unknown>,
  bookToChannel: Map<string, string>,
  channelToStore: Map<string, string>,
): WorkerRow | null {
  // IdentityEmail is the Azure AD sign-in address; PrimaryContactEmail is a
  // separate, often-empty HR field.
  const email = pick(row, ['IdentityEmail', 'PrimaryContactEmail', 'Email', 'EmailAddress']).toLowerCase();
  if (!email || !email.includes('@')) return null;
  return {
    email,
    personnel_number: pick(row, ['PersonnelNumber']) || null,
    name: pick(row, ['Name', 'FullName']) || null,
    phone: pick(row, ['PrimaryContactPhone', 'Phone', 'Mobile']) || null,
    store_id: resolveStoreId(pick(row, ['AddressBooks']), bookToChannel, channelToStore),
  };
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
  const probe = new URL(req.url).searchParams.get('probe') === '1';

  try {
    const cfg = await loadD365Config(supabase);
    const token = await getD365Token(cfg);

    // --- Discovery mode: report each candidate entity's shape, sync nothing. ---
    if (probe) {
      const report: Record<string, unknown> = {};
      for (const entity of WORKER_ENTITIES) {
        const rows = await fetchEntity(token, cfg, entity, 3);
        if ('error' in rows) { report[entity] = rows; continue; }
        report[entity] = {
          count: rows.length,
          keys: rows[0] ? Object.keys(rows[0]) : [],
          sample: rows[0] ? redact(rows[0]) : null,
        };
      }
      return new Response(JSON.stringify({ probe: true, report }, null, 2), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // --- Store-linkage diagnostic: raw AddressBooks per worker + all store books. ---
    if (new URL(req.url).searchParams.get('links') === '1') {
      const workers = await fetchEntity(token, cfg, 'Workers', 20);
      const books = await fetchEntity(token, cfg, 'RetailStoreAddressBooks', 500);
      const workerLinks = ('error' in workers) ? workers : workers.map((w) => ({
        email: w.IdentityEmail, name: w.Name, addressBooks: w.AddressBooks,
        officeLocation: w.OfficeLocationId, personnel: w.PersonnelNumber,
      }));
      return new Response(JSON.stringify({ workerLinks, storeBooks: books }, null, 2), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Build the two lookups for store resolution:
    //   Employee AddressBookName → store RetailChannelId  (from D365)
    //   store RetailChannelId    → our stores.id          (from our DB)
    const bookToChannel = new Map<string, string>();
    const storeBooks = await fetchEntity(token, cfg, 'RetailStoreAddressBooks', 2000);
    if (!('error' in storeBooks)) {
      for (const b of storeBooks) {
        if (str(b.AddressBookType) === 'Employee') {
          const name = str(b.AddressBookName);
          const channel = str(b.RetailChannelId);
          if (name && channel) bookToChannel.set(name, channel);
        }
      }
    }
    const channelToStore = new Map<string, string>();
    const { data: storeRows } = await supabase
      .from('stores')
      .select('id, retail_channel_id')
      .not('retail_channel_id', 'is', null);
    for (const s of (storeRows ?? []) as { id: string; retail_channel_id: string }[]) {
      channelToStore.set(s.retail_channel_id, s.id);
    }

    // Pull workers from the Workers entity (confirmed source of IdentityEmail).
    const rows = await fetchEntity(token, cfg, 'Workers', 10000);
    if ('error' in rows || !rows.length) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_workers_returned', synced: 0 }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
    const seen = new Set<string>();
    const workers: WorkerRow[] = [];
    for (const r of rows) {
      const w = mapWorker(r, bookToChannel, channelToStore);
      if (w && !seen.has(w.email)) { seen.add(w.email); workers.push(w); }
    }

    if (!workers.length) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_email_bearing_workers', synced: 0 }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const { error } = await supabase.from('workers').upsert(workers, { onConflict: 'email' });
    if (error) throw error;

    const withStore = workers.filter((w) => w.store_id).length;
    console.log(`[sync-workers] synced ${workers.length} workers, ${withStore} with a store`);
    return new Response(
      JSON.stringify({ ok: true, synced: workers.length, with_store: withStore }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[sync-workers] error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
