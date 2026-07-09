import type { PosterRates } from '../../lib/utils/goldPoster';

export interface GoldRatePosterModalProps {
  visible: boolean;
  onClose: () => void;
  rates: PosterRates | null;
  date: Date;
}

// Web stub — the browser uses the DOM-canvas download in lib/utils/goldPoster.
// The real, native implementation lives in GoldRatePosterModal.native.tsx.
export function GoldRatePosterModal(_props: GoldRatePosterModalProps) {
  return null;
}
