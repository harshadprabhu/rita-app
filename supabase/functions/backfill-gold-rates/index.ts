import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ONE-TIME BACKFILL: pull every historical gold rate D365 holds and populate
// `gold_rates`, so the trend charts have real history instead of only the days
// since the cron started.
//
// Reads the same C_JISchemeAppMetalRate OData entity as sync-gold-rate, but
// over a wide EntryDate range with paging. For each (entry_date, purity) it
// keeps the latest EntryTime — matching the daily sync's semantics — then
// upserts in chunks.
//
//   POST /backfill-gold-rates?from=2020-01-01[&to=YYYY-MM-DD][&dry=1]
//
// Safe to re-run: the upsert is keyed on (entry_date, metal, purity).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const D365_DEFAULT_BASE = 'https://novel.operations.dynamics.com';
const D365_DEFAULT_WAREHOUSE = 'NS0001';
const MIN_PLAUSIBLE_GOLD_RATE = 1000;
// Keep pages small and the payload narrow ($select) — the edge runtime has a
// hard memory ceiling and this entity holds many rows per day.
const PAGE = 1000;
const SELECT = 'Metal,Purity,Rate,Warehouse,EntryDate,EntryTime';

interface D365Config {
  clientId: string; clientSecret: string; tenantId: string; resourceUrl: string; warehouse: string;
}

async function loadD365Config(supabase: ReturnType<typeof createClient>): Promise<D365Config> {
  const { data } = await supabase
    .from('integration_settings')
    .select('d365_client_id, d365_client_secret, d365_tenant_id, d365_resource_url, d365_warehouse')
    .eq('id', 1).maybeSingle();
  const row = (data ?? {}) as Record<string, string | null>;
  return {
    clientId:     row.d365_client_id     || Deno.env.get('D365_CLIENT_ID')     || '',
    clientSecret: row.d365_client_secret || Deno.env.get('D365_CLIENT_SECRET') || '',
    tenantId:     row.d365_tenant_id     || Deno.env.get('D365_TENANT_ID')     || '',
    resourceUrl:  row.d365_resource_url  || D365_DEFAULT_BASE,
    warehouse:    row.d365_warehouse     || D365_DEFAULT_WAREHOUSE,
  };
}

async function getD365Token(cfg: D365Config): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenantId) throw new Error('D365 credentials not configured');
  const body = new URLSearchParams({
    client_id: cfg.clientId, client_secret: cfg.clientSecret,
    grant_type: 'client_credentials', resource: cfg.resourceUrl,
  });
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status}`);
  return (await res.json()).access_token as string;
}

interface RateRow { Metal: string; Purity: string; Rate: number; Warehouse?: string; EntryDate?: string; EntryTime?: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '2015-01-01';
  const to = url.searchParams.get('to') || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const dry = url.searchParams.get('dry') === '1';

  try {
    const cfg = await loadD365Config(supabase);
    const token = await getD365Token(cfg);

    const start = `${from}T00:00:00Z`;
    const endD = new Date(`${to}T00:00:00Z`);
    endD.setUTCDate(endD.getUTCDate() + 1); // inclusive of `to`
    const end = `${endD.toISOString().slice(0, 10)}T00:00:00Z`;

    // Filter warehouse server-side: this entity carries a row per warehouse, so
    // omitting it drags in every store's copy and blows the time limit.
    // ?wh=0 opts out (falls back to client-side filtering).
    const whParam = url.searchParams.get('wh');
    const warehouse = whParam === '0' ? '' : (whParam || cfg.warehouse);
    const filter =
      `RateType eq Microsoft.Dynamics.DataEntities.PwC_MetalRateType'Sale'` +
      ` and IsRetail eq Microsoft.Dynamics.DataEntities.NoYes'Yes'` +
      (warehouse ? ` and Warehouse eq '${warehouse}'` : '') +
      ` and Metal eq Microsoft.Dynamics.DataEntities.PwC_MetalType'Gold'` +
      ` and EntryDate ge ${start} and EntryDate lt ${end}`;

    // latest rate per (entry_date, purity), by EntryTime
    const best = new Map<string, { date: string; purity: string; rate: number; t: number }>();
    let fetched = 0;
    let skip = 0;

    for (;;) {
      const u = `${cfg.resourceUrl}/data/C_JISchemeAppMetalRate?$top=${PAGE}&$skip=${skip}&$select=${SELECT}&$filter=${encodeURIComponent(filter)}`;
      const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OData ${res.status}: ${body.slice(0, 300)}`);
      }
      const { value } = await res.json();
      const rows = (value ?? []) as RateRow[];
      fetched += rows.length;

      for (const r of rows) {
        if (r.Metal !== 'Gold' || !(r.Rate >= MIN_PLAUSIBLE_GOLD_RATE)) continue;
        if (cfg.warehouse && r.Warehouse && r.Warehouse !== cfg.warehouse) continue;
        const date = String(r.EntryDate ?? '').slice(0, 10);
        if (!date) continue;
        const key = `${date}|${r.Purity}`;
        const t = r.EntryTime ?? 0;
        const ex = best.get(key);
        if (!ex || t >= ex.t) best.set(key, { date, purity: r.Purity, rate: r.Rate, t });
      }

      if (rows.length < PAGE) break;
      skip += PAGE;
      if (skip > 200000) break; // hard stop
    }

    const out = [...best.values()].map((v) => ({
      entry_date: v.date, metal: 'Gold', purity: v.purity, rate: v.rate, currency: 'INR',
    }));
    out.sort((a, b) => a.entry_date.localeCompare(b.entry_date));

    const summary = {
      from, to, rows_fetched: fetched, day_purity_points: out.length,
      first_date: out[0]?.entry_date ?? null,
      last_date: out[out.length - 1]?.entry_date ?? null,
      distinct_dates: new Set(out.map((o) => o.entry_date)).size,
      purities: [...new Set(out.map((o) => o.purity))],
    };
    if (dry) return new Response(JSON.stringify({ dry: true, ...summary }, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });

    // Upsert in chunks so we don't blow the request size.
    let written = 0;
    for (let i = 0; i < out.length; i += 500) {
      const chunk = out.slice(i, i + 500);
      const { error } = await supabase.from('gold_rates').upsert(chunk, { onConflict: 'entry_date,metal,purity' });
      if (error) throw error;
      written += chunk.length;
    }

    return new Response(JSON.stringify({ ok: true, written, ...summary }, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[backfill-gold-rates]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
