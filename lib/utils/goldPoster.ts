// Generates a downloadable "Today's Gold Rates" poster by drawing the exact
// Indriya template image (assets/gold-rate-template.png) and overlaying only the
// dynamic bits — today's date on the "Date:" line and each rate inside its ₹ box.
// Web-only (uses the DOM canvas + anchor download); guarded for native/SSR.
import { Image as RNImage } from 'react-native';

export interface PosterRates {
  '24k_999': number;
  '24k_995': number;
  '22k_916': number;
  '18k_750': number;
}

// The template's native pixel size — all overlay coordinates below are in this space.
const TPL_W = 1054;
const TPL_H = 1492;
const GOLD = '#f2d98a';

// Resolve the bundled template image URL lazily and defensively — doing this at
// module scope can throw on some web/SSR loads and take the whole app down.
let _templateUri: string | undefined | null = null; // null = not resolved yet
function getTemplateUri(): string | undefined {
  if (_templateUri === null) {
    try {
      _templateUri = RNImage.resolveAssetSource(require('../../assets/gold-rate-template.png'))?.uri;
    } catch {
      _templateUri = undefined;
    }
  }
  return _templateUri ?? undefined;
}

// Centre of each empty ₹ value box (x is right of the printed ₹ glyph), and the
// baseline point for the date on the "Date: ____" line.
const DATE_POINT = { x: 596, y: 512 };
const RATE_POINTS = [
  { key: '24k_999', x: 792, y: 652 },
  { key: '24k_995', x: 792, y: 806 },
  { key: '22k_916', x: 792, y: 960 },
  { key: '18k_750', x: 792, y: 1113 },
] as const;

function ordinal(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatPosterDate(d = new Date()): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()}${ordinal(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Map RITA's D365 purity-keyed rates to the poster's four fixed rows. */
export function ratesFromGold(rates: Record<string, number>): PosterRates | null {
  const r: PosterRates = {
    '24k_999': rates['24KT 999'],
    '24k_995': rates['24KT 995'],
    '22k_916': rates['22KT'],
    '18k_750': rates['18KT'],
  };
  if (![r['24k_999'], r['24k_995'], r['22k_916'], r['18k_750']].some((v) => v > 0)) return null;
  return r;
}

export function isPosterSupported(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function' && !!getTemplateUri();
}

/**
 * Render the poster (exact template + overlaid date & rates) and download a PNG.
 * @param scale render multiplier (1 = native 1054x1492; 2 = higher-res print).
 */
export function downloadGoldRatePoster(rates: PosterRates, date = new Date(), scale = 2): void {
  const templateUri = getTemplateUri();
  if (!isPosterSupported() || !templateUri) return;

  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = TPL_W * scale;
    canvas.height = TPL_H * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw the exact template as the background.
    ctx.drawImage(img, 0, 0, TPL_W * scale, TPL_H * scale);

    ctx.fillStyle = GOLD;

    // 2. Date on the "Date:" line.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${Math.round(30 * scale)}px Georgia, "Playfair Display", serif`;
    ctx.fillText(formatPosterDate(date), DATE_POINT.x * scale, DATE_POINT.y * scale);
    ctx.restore();

    // 3. Each rate value, centred in its ₹ box (whole rupees).
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(46 * scale)}px "Outfit", "Poppins", Arial, sans-serif`;
    for (const pt of RATE_POINTS) {
      const value = rates[pt.key as keyof PosterRates];
      if (!(value > 0)) continue;
      ctx.fillText(Math.round(value).toLocaleString('en-IN'), pt.x * scale, pt.y * scale);
    }
    ctx.restore();

    // 4. Download.
    try {
      const link = document.createElement('a');
      link.download = `indriya_gold_rates_${date.toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Defensive: same-origin asset shouldn't taint the canvas.
    }
  };
  img.src = templateUri;
}
