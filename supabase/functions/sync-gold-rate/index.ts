import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const D365_BASE = 'https://novel.operations.dynamics.com';

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

async function getD365Token(): Promise<string> {
  const body = new URLSearchParams({
    client_id:     Deno.env.get('D365_CLIENT_ID')!,
    client_secret: Deno.env.get('D365_CLIENT_SECRET')!,
    grant_type:    'client_credentials',
    resource:      D365_BASE,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get('D365_TENANT_ID')}/oauth2/token`,
    { method: 'POST', body },
  );
  if (!res.ok) throw new Error(`OAuth failed: ${res.status}`);
  const { access_token } = await res.json();
  return access_token as string;
}

async function fetchD365Rates(token: string, dateIST: string): Promise<D365Item[]> {
  const filter =
    `RateType eq Microsoft.Dynamics.DataEntities.PwC_MetalRateType'Sale'` +
    ` and IsRetail eq Microsoft.Dynamics.DataEntities.NoYes'Yes'` +
    ` and EntryDate eq ${dateIST}` +
    ` and Warehouse eq 'NS0001'`;
  const url = `${D365_BASE}/data/C_JISchemeAppMetalRate?$filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`D365 API failed: ${res.status}`);
  const { value } = await res.json();
  return value as D365Item[];
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

  // Today's date in IST (India Standard Time, UTC+5:30)
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

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
    const token = await getD365Token();
    const items = await fetchD365Rates(token, todayIST);

    if (!items.length) throw new Error('D365 returned no rates');

    const targetSet = new Set(TARGET_PURITIES);
    const filteredItems = items.filter((i) => i.Metal === 'Gold' && targetSet.has(i.Purity) && i.Rate > 0);
    if (!filteredItems.length) {
      throw new Error(`D365 returned no valid rates for target purities; available: ${items.map((i) => `${i.Metal}/${i.Purity}`).join(', ')}`);
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
