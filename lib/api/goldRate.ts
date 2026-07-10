import { supabase } from '../supabase';

export interface GoldRate {
  id: string;
  entry_date: string;
  metal: string;
  purity: string;
  rate: number;
  currency: string;
  updated_at: string;
}

/** Map of purity → rate for a single day, Gold metal only. */
export interface DailyGoldRates {
  entry_date: string;
  updated_at: string;
  rates: Record<string, number>;
}

/**
 * Read the latest Gold rates directly from the `gold_rates` table.
 *
 * Clients never call the D365 sync edge function — that runs on a cron
 * (the single writer/notifier). This is a cheap indexed read of the most
 * recent day's rates, keyed by purity to match the card's expected shape.
 */
export async function getLatestGoldRates(): Promise<DailyGoldRates | null> {
  const { data, error } = await supabase
    .from('gold_rates')
    .select('entry_date, purity, rate, updated_at')
    .eq('metal', 'Gold')
    .order('entry_date', { ascending: false })
    .limit(20); // a day has ~4 purities; headroom to cover the latest day
  if (error) {
    console.warn('[getLatestGoldRates]', error.message);
    return null;
  }

  const rows = (data ?? []) as Pick<GoldRate, 'entry_date' | 'purity' | 'rate' | 'updated_at'>[];
  if (!rows.length) return null;

  // Rows are sorted newest-day first; keep only the most recent entry_date.
  const latestDate = rows[0].entry_date;
  const latestRows = rows.filter((r) => r.entry_date === latestDate);

  const rates: Record<string, number> = {};
  let updatedAt = latestRows[0].updated_at;
  for (const row of latestRows) {
    rates[row.purity] = row.rate;
    if (row.updated_at > updatedAt) updatedAt = row.updated_at;
  }

  return { entry_date: latestDate, updated_at: updatedAt, rates };
}

/** A single day's rate for one purity, used to plot the trend graph. */
export interface GoldRateTrendPoint {
  entry_date: string;
  rate: number;
}

/**
 * Read up to the last 7 days of rates for a single purity, oldest first.
 *
 * Only fetched when the gold rate card is expanded. Days can have gaps (the
 * D365 sync skips some days), so callers must space points by `entry_date`
 * rather than assuming one point per calendar day.
 */
export async function getGoldRateTrend(purity = '24KT 999', days = 7): Promise<GoldRateTrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from('gold_rates')
    .select('entry_date, rate')
    .eq('metal', 'Gold')
    .eq('purity', purity)
    .gte('entry_date', sinceDate)
    .order('entry_date', { ascending: true });
  if (error) {
    console.warn('[getGoldRateTrend]', error.message);
    return [];
  }

  const rows = (data ?? []) as Pick<GoldRate, 'entry_date' | 'rate'>[];
  return rows.map((r) => ({ entry_date: r.entry_date, rate: Number(r.rate) }));
}
