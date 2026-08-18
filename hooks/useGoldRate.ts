import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getLatestGoldRates, getGoldRateTrend } from '../lib/api/goldRate';
import { supabase } from '../lib/supabase';

export function useGoldRate() {
  const qc = useQueryClient();

  // Realtime: refetch as soon as gold_rates rows are inserted or updated
  useEffect(() => {
    const channel = supabase
      .channel('gold-rates-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gold_rates' },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.goldRate() });
          qc.invalidateQueries({ queryKey: QUERY_KEYS.goldRateTrend() });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return useQuery({
    queryKey: QUERY_KEYS.goldRate(),
    queryFn: getLatestGoldRates,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: 'always',
    retry: 1,
  });
}

/** Trend for the headline 24K (999) purity over `days`. Enable when expanded. */
export function useGoldRateTrend(enabled = true, days = 7) {
  return useQuery({
    queryKey: [...QUERY_KEYS.goldRateTrend(), days],
    queryFn: () => getGoldRateTrend('24KT 999', days),
    staleTime: 2 * 60 * 1000,
    retry: 1,
    enabled,
  });
}

/** Returns a stable function that forces a fresh sync from D365. */
export function useRefreshGoldRate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QUERY_KEYS.goldRate() });
}
