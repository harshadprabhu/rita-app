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
export function GoldTrendPosterModal(_props: GoldTrendPosterModalProps) {
  return null;
}

/** Customer scheme enrolment link printed on the poster. */
export const IGP_URL = 'https://www.igp.indriya.com/';
