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
      // On Expo web `require` of an image returns the URL string; on native it
      // returns an asset object/number that resolveAssetSource turns into a uri.
      const asset = require('../../assets/gold-rate-template.png') as unknown;
      _templateUri =
        typeof asset === 'string'
          ? asset
          : (asset as { uri?: string })?.uri ?? RNImage.resolveAssetSource(asset as number)?.uri;
    } catch {
      _templateUri = undefined;
    }
  }
  return _templateUri ?? undefined;
}

// Preload the template into an <img> at module load so that, by the time the
// user taps download, drawing can happen synchronously inside the tap gesture.
// This matters on iOS Safari: the Web Share sheet (the only way to save an
// image to Photos there) must be invoked from within a user gesture, and an
// async image load would break that chain.
let _templateImg: HTMLImageElement | null = null;
function getTemplateImage(): HTMLImageElement | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (!_templateImg) {
    const uri = getTemplateUri();
    if (!uri) return null;
    _templateImg = new window.Image();
    _templateImg.crossOrigin = 'anonymous';
    _templateImg.src = uri;
  }
  return _templateImg;
}
if (typeof window !== 'undefined') getTemplateImage();

/** Synchronously turn a data URL into a Blob (no async fetch — keeps the gesture). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function anchorDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Deliver the poster: share sheet on mobile (saves to Photos on iOS), download on desktop. */
function deliverPoster(canvas: HTMLCanvasElement, fileName: string): void {
  const dataUrl = canvas.toDataURL('image/png');
  const blob = dataUrlToBlob(dataUrl);
  const nav = navigator as Navigator & {
    canShare?: (d: unknown) => boolean;
    share?: (d: unknown) => Promise<void>;
  };
  try {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      nav.share({ files: [file], title: "Today's Gold Rates" }).catch(() => anchorDownload(blob, fileName));
      return;
    }
  } catch {
    // File/canShare unsupported — fall through to download.
  }
  anchorDownload(blob, fileName);
}

// Centre of each empty ₹ value box (x is right of the printed ₹ glyph), and the
// baseline point for the date on the "Date: ____" line. Measured directly off
// the template PNG's gold border pixels (all 4 boxes share the same left/right
// edges at x=560/919; the printed ₹ glyph spans x=597-623 inside each box).
const DATE_POINT = { x: 594, y: 512 };
const RATE_POINTS = [
  { key: '24k_999', x: 772, y: 639 },
  { key: '24k_995', x: 772, y: 790 },
  { key: '22k_916', x: 772, y: 940 },
  { key: '18k_750', x: 772, y: 1086 },
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

/** Draw the poster (template + overlaid date & rates) onto a fresh canvas. */
function renderPosterCanvas(img: HTMLImageElement, rates: PosterRates, date: Date, scale: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = TPL_W * scale;
  canvas.height = TPL_H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

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
  return canvas;
}

/**
 * Generate the poster and hand it to the user — the share sheet on mobile
 * (which saves to Photos on iOS, where an <a download> is ignored) or a file
 * download on desktop.
 * @param scale render multiplier (1 = native 1054x1492; 2 = higher-res print).
 */
export function downloadGoldRatePoster(rates: PosterRates, date = new Date(), scale = 2): void {
  if (!isPosterSupported()) return;
  const img = getTemplateImage();
  if (!img) return;

  const fileName = `indriya_gold_rates_${date.toISOString().slice(0, 10)}.png`;
  const run = () => {
    try {
      const canvas = renderPosterCanvas(img, rates, date, scale);
      if (canvas) deliverPoster(canvas, fileName);
    } catch {
      // Same-origin asset shouldn't taint the canvas; ignore if it somehow does.
    }
  };

  // Loaded (preloaded at module init) → run synchronously so the share sheet
  // stays inside the tap gesture on iOS. Otherwise wait for load (desktop path).
  if (img.complete && img.naturalWidth > 0) run();
  else img.addEventListener('load', run, { once: true });
}
