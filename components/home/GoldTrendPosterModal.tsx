import type { GoldRateTrendPoint } from '../../lib/api/goldRate';

export interface TrendSeries {
  label: string;
  points: GoldRateTrendPoint[];
}

export interface GoldTrendPosterModalProps {
  visible: boolean;
  onClose: () => void;
  series: TrendSeries[];
  currentRate: number | null;
  date: Date;
}

// Web stub — the real, native implementation lives in
// GoldTrendPosterModal.native.tsx (ViewShot + share sheet).
//
// Export *types only* from here that the native file needs: on native, the
// path './GoldTrendPosterModal' resolves to the .native file itself, so any
// runtime value imported from it would be undefined. Shared values belong in
// constants/links.
export function GoldTrendPosterModal(_props: GoldTrendPosterModalProps) {
  return null;
}
