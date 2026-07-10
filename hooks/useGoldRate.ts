import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getLatestGoldRates, getGoldRateTrend } from '../lib/api/goldRate';

export function useGoldRate() {
  return useQuery({
    queryKey: QUERY_KEYS.goldRate(),
    queryFn: getLatestGoldRates,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always', // cheap DB read on mount (app start, tab focus); cron keeps it ≤5 min fresh
    retry: 1,
  });
}

/** Trend for the headline 24K (999) purity over `days`. Enable when expanded. */
export function useGoldRateTrend(enabled = true, days = 7) {
  return useQuery({
    queryKey: [...QUERY_KEYS.goldRateTrend(), days],
    queryFn: () => getGoldRateTrend('24KT 999', days),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled,
  });
}

/** Returns a stable function that forces a fresh sync from D365. */
export function useRefreshGoldRate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QUERY_KEYS.goldRate() });
}
