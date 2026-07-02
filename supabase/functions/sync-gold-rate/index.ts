import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function formatRate(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Whole-rupee formatting for the push notification (no decimals, Indian grouping).
function formatWhole(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

// D365 purity key → display label, in the order they appear in the notification
const GOLD_RATE_DISPLAY: [string, string][] = [
  ['24KT 999', '24K (999)'],
  ['24KT 995', '24K (995)'],
  ['22KT',     '22K (916)'],
  ['18KT',     '18K (750)'],
];

async function notifyRateUpdate(
  supabase: SupabaseClient,
  rates: Record<string, number>,
): Promise<void> {
  const RUPEE = '₹';

  const entries = GOLD_RATE_DISPLAY
    .map(([key, label]) => ({ key, label, rate: rates[key] }))
    .filter(({ rate }) => rate > 0);

  if (!entries.length) {
    console.warn('[sync-gold-rate] none of the expected purity keys found; available:', Object.keys(rates));
    return;
  }

  // 2 rates per line:
  // "24K (999): ₹5,650.00  |  22K (916): ₹5,182.00"
  const pairs: string[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    pairs.push(
      entries.slice(i, i + 2)
        .map(({ label, rate }) => `${label}: ${RUPEE}${formatRate(rate)}`)
        .join('  |  '),
    );
  }
  const body = pairs.join('\n');

  const title = 'Gold Rate Updated';

  // Push notification gets its own cleaner formatting (a single headline line with
  // whole rupees and a dated title); the broadcast `body`/`title` above stay as-is so
  // the in-app announcement card keeps its full 4-tile grid with decimals.
  const PUSH_LEAD = ['22KT', '24KT 999']; // retail-relevant purities, surfaced first
  const pushEntries = [
    ...PUSH_LEAD
      .map((key) => entries.find((e) => e.key === key))
      .filter((e): e is typeof entries[number] => !!e),
    ...entries.filter((e) => !PUSH_LEAD.includes(e.key)),
  ];
  const pushBody = pushEntries
    .map(({ label, rate }) => `${label} ${RUPEE}${formatWhole(rate)}`)
    .join(' · ');
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(new Date());
  const pushTitle = `Gold rates today · ${dateLabel}`;

  // 1. Create a broadcast record so the announcement appears in all stores' feeds.
  // Prefer an approved admin as sender; fall back to any approved profile so a
  // missing admin can't silently drop the broadcast (sender_id is required).
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('approval_status', 'approved')
    .limit(1)
    .maybeSingle();

  let senderId = (admin as { id: string } | null)?.id;
  if (!senderId) {
    const { data: fallback } = await supabase
      .from('profiles')
      .select('id')
      .eq('approval_status', 'approved')
      .limit(1)
      .maybeSingle();
    senderId = (fallback as { id: string } | null)?.id;
  }

  if (senderId) {
    const { error: bcastError } = await supabase.from('broadcasts').insert({
      sender_id: senderId,
      title,
      body,
      // target_store_id and target_store_ids both omitted → all stores
    });
    if (bcastError) {
      console.error('[sync-gold-rate] broadcast insert failed:', bcastError);
    }
  } else {
    console.warn('[sync-gold-rate] no approved profile found; broadcast not created');
  }

  // 2. Send push notification to every registered device.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .not('expo_push_token', 'is', null);

  const tokens = ((profiles ?? []) as { expo_push_token: string | null }[])
    .map((p) => p.expo_push_token)
    .filter(Boolean) as string[];

  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to, title: pushTitle, body: pushBody, sound: 'default', data: { type: 'broadcast' },
    // Android: deliver via the high-importance channel created on the client so
    // the notification wakes the device and shows even when the app is closed.
    channelId: 'default',
    priority: 'high',
    // iOS: a normal alert push (sound + title/body) requires no extra fields.
  }));

  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}

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
      // Rates unchanged — return current DB data without notifying
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

    void notifyRateUpdate(supabase, result.rates).catch(
      (err) => console.error('[sync-gold-rate] push failed:', err),
    );

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // D365 unreachable — fall back to most recent day's Gold rates in DB (no notification)
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
