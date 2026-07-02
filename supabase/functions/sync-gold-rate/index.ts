import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const D365_DEFAULT_BASE = 'https://novel.operations.dynamics.com';
const D365_DEFAULT_WAREHOUSE = 'NS0001';

interface D365Config {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  resourceUrl: string;
  warehouse: string;
}

interface D365Item {
  Metal: string;
  Purity: string;
  Rate: number;
}

interface DailyGoldRates {
  entry_date: string;
  updated_at: string;
  rates: Record<string, number>; // purity → rate, Gold metal only
}

/**
 * Resolve the D365 credentials. The admin-managed `integration_settings` row
 * takes precedence (so edits in the app apply on the next cron run without a
 * redeploy); env-var secrets are the fallback for backwards compatibility.
 */
async function loadD365Config(
  supabase: ReturnType<typeof createClient>,
): Promise<D365Config> {
  const { data } = await supabase
    .from('integration_settings')
    .select('d365_client_id, d365_client_secret, d365_tenant_id, d365_resource_url, d365_warehouse')
    .eq('id', 1)
    .maybeSingle();

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
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenantId) {
    throw new Error('D365 credentials not configured');
  }
  const body = new URLSearchParams({
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type:    'client_credentials',
    resource:      cfg.resourceUrl,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/token`,
    { method: 'POST', body },
  );
  if (!res.ok) throw new Error(`OAuth failed: ${res.status}`);
  const { access_token } = await res.json();
  return access_token as string;
}

// Pull a numeric rate out of whatever shape the custom service returns:
// a bare number, a numeric string, a JSON string, or an object wrapping the
// value under a common key. Deep-scans as a last resort.
function parseRate(data: unknown): number | null {
  if (typeof data === 'number') return isFinite(data) ? data : null;
  if (typeof data === 'string') {
    const n = Number(data.trim());
    if (isFinite(n) && data.trim() !== '') return n;
    try { return parseRate(JSON.parse(data)); } catch { return null; }
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const k of ['value', 'Value', 'Rate', 'rate', 'MetalRate', 'metalRate', 'Result', 'result', 'ReturnValue']) {
      if (k in obj) { const r = parseRate(obj[k]); if (r != null) return r; }
    }
    for (const v of Object.values(obj)) { const r = parseRate(v); if (r != null) return r; }
  }
  return null;
}

/**
 * Fetch one purity's rate via the D365 custom service. This environment exposes
 * gold rates through PwC_JISchemeAppService.getMetalRate (invoked once per
 * purity), NOT a queryable OData entity.
 *
 * Parameter order (per the service contract):
 *   [ dateStr(DD-MM-YYYY), purity, warehouse, metalType('1'=Gold), rateType('Sale'), isRetail('Yes') ]
 */
async function fetchD365Rate(
  token: string,
  cfg: D365Config,
  dateStr: string,
  purity: string,
): Promise<number | null> {
  const url = `${cfg.resourceUrl}/api/services/PwC_JIServices/PwC_JISchemeAppService/InvokeMethod`;
  const payload = {
    request: {
      MethodName: 'getMetalRate',
      Parameters: [dateStr, purity, cfg.warehouse, '1', 'Sale', 'Yes'],
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[sync-gold-rate] getMetalRate(${purity}) HTTP ${res.status}: ${text.slice(0, 250)}`);
    return null;
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  const rate = parseRate(data);
  if (rate == null) {
    console.warn(`[sync-gold-rate] getMetalRate(${purity}) unparseable response: ${text.slice(0, 250)}`);
  }
  return rate;
}

/** Fetch every target purity, one call each; returns those with a valid rate. */
async function fetchD365Rates(token: string, dateStr: string, cfg: D365Config): Promise<D365Item[]> {
  const out: D365Item[] = [];
  for (const [purity] of GOLD_RATE_DISPLAY) {
    const rate = await fetchD365Rate(token, cfg, dateStr, purity);
    if (rate != null && rate > 0) out.push({ Metal: 'Gold', Purity: purity, Rate: rate });
  }
  return out;
}

function buildDailyRates(
  rows: { purity: string; rate: number; updated_at: string }[],
  entryDate: string,
): DailyGoldRates {
  const rates: Record<string, number> = {};
  for (const row of rows) rates[row.purity] = row.rate;
  return {
    entry_date: entryDate,
    updated_at: rows[0]?.updated_at ?? new Date().toISOString(),
    rates,
  };
}

// D365 purity keys the app displays, in display order
const GOLD_RATE_DISPLAY: [string, string][] = [
  ['24KT 999', '24K (999)'],
  ['24KT 995', '24K (995)'],
  ['22KT',     '22K (916)'],
  ['18KT',     '18K (750)'],
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Today's date in IST (India Standard Time, UTC+5:30).
  // `todayIST` (YYYY-MM-DD) is used for the DB `entry_date` column; the D365
  // getMetalRate service wants DD-MM-YYYY, so we derive that too.
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const dateApi = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date()).replace(/\//g, '-'); // DD-MM-YYYY

  const TARGET_PURITIES = GOLD_RATE_DISPLAY.map(([key]) => key);

  // Always fetch current DB rates — needed for change comparison and D365 fallback.
  const { data: existing } = await supabase
    .from('gold_rates')
    .select('purity, rate, updated_at')
    .eq('entry_date', todayIST)
    .eq('metal', 'Gold')
    .in('purity', TARGET_PURITIES);

  const existingRateMap: Record<string, number> = {};
  for (const row of (existing ?? []) as { purity: string; rate: number; updated_at: string }[]) {
    existingRateMap[row.purity] = row.rate;
  }
  const isFirstFetchToday = (existing ?? []).length === 0;

  // Fetch from D365 and detect changes
  try {
    const cfg = await loadD365Config(supabase);
    const token = await getD365Token(cfg);
    const filteredItems = await fetchD365Rates(token, dateApi, cfg);

    if (!filteredItems.length) {
      throw new Error('D365 returned no valid rates for target purities');
    }

    // Check if any rate value actually changed vs what's in DB
    const hasRateChange = filteredItems.some((item) => existingRateMap[item.Purity] !== item.Rate);

    if (!isFirstFetchToday && !hasRateChange) {
      // Rates unchanged — return current DB data without re-writing
      const result = buildDailyRates(
        existing as { purity: string; rate: number; updated_at: string }[],
        todayIST,
      );
      return new Response(JSON.stringify(result), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const rows = filteredItems.map((item) => ({
      entry_date: todayIST,
      metal:      item.Metal,
      purity:     item.Purity,
      rate:       item.Rate,
      currency:   'INR',
    }));

    // Upsert with update (not ignoreDuplicates) so intraday rate changes are persisted
    const { error: upsertError } = await supabase
      .from('gold_rates')
      .upsert(rows, { onConflict: 'entry_date,metal,purity' });

    if (upsertError) throw upsertError;

    // Re-fetch to get DB-stamped updated_at
    const { data: updatedRows } = await supabase
      .from('gold_rates')
      .select('purity, rate, updated_at')
      .eq('entry_date', todayIST)
      .eq('metal', 'Gold')
      .in('purity', TARGET_PURITIES);

    const result = buildDailyRates(
      (updatedRows ?? []) as { purity: string; rate: number; updated_at: string }[],
      todayIST,
    );

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // D365 unreachable — fall back to most recent day's Gold rates in DB
    console.error('[sync-gold-rate] D365 error, using DB fallback:', err);

    if (existing && existing.length > 0) {
      const result = buildDailyRates(
        existing as { purity: string; rate: number; updated_at: string }[],
        todayIST,
      );
      return new Response(JSON.stringify(result), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: latestDay } = await supabase
      .from('gold_rates')
      .select('entry_date')
      .eq('metal', 'Gold')
      .order('entry_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestDay) {
      return new Response(JSON.stringify(null), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: fallbackRows } = await supabase
      .from('gold_rates')
      .select('purity, rate, updated_at')
      .eq('entry_date', (latestDay as { entry_date: string }).entry_date)
      .eq('metal', 'Gold')
      .in('purity', TARGET_PURITIES);

    const result = buildDailyRates(
      (fallbackRows ?? []) as { purity: string; rate: number; updated_at: string }[],
      (latestDay as { entry_date: string }).entry_date,
    );

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
