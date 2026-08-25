// Generates a downloadable "Today's Gold Rates" poster by drawing the exact
// Indriya template image (assets/gold-rate-template.png) and overlaying only the
// dynamic bits — today's date on the "Date:" line and each rate inside its ₹ box.
// Web-only (uses the DOM canvas + anchor download); guarded for native/SSR.
import { Image as RNImage, Platform } from 'react-native';

// jspdf is lazy-required (not top-level imported) because its module-init
// code calls `new TextDecoder('latin1')` — an encoding Hermes doesn't
// support, which crashes the whole app right after login on Android as
// soon as any route imports this file. Deferring the require to the
// exact functions that need it means Hermes never evaluates the offending
// module on native (posters use expo-print there anyway), and web still
// works because those functions are the only ones that call require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireJsPdf = () => require('jspdf').jsPDF as typeof import('jspdf').jsPDF;

export interface PosterRates {
  '24k_999': number;
  '24k_995': number;
  '22k_916': number;
  '18k_750': number;
}

// The template's native pixel size — all overlay coordinates below are in this space.
const TPL_W = 1054;
const TPL_H = 1491;
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

// iOS Safari (incl. iPadOS, which reports as MacIntel + touch) is the one place
// an <a download> is silently ignored, so it's the only place we fall back to
// the share sheet. Everywhere else — desktop Edge/Chrome/Firefox, Android — a
// direct download is what the user expects, even though those browsers may also
// expose the Web Share API.
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

/** Wrap a canvas image into an A4 PDF and deliver it. */
function deliverPoster(canvas: HTMLCanvasElement, fileName: string): void {
  const jsPDF = requireJsPdf();
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  const blob = pdf.output('blob');

  if (isIOS()) {
    const nav = navigator as Navigator & {
      canShare?: (d: unknown) => boolean;
      share?: (d: unknown) => Promise<void>;
    };
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        nav.share({ files: [file], title: "Today's Gold Rates" }).catch(() => anchorDownload(blob, fileName));
        return;
      }
    } catch {
      // Fall through to download.
    }
  }
  anchorDownload(blob, fileName);
}

/** Convert a PNG data URL to a PDF blob sized to fit the image on an A4 page. */
export function pngDataUrlToPdfBlob(dataUrl: string): Blob {
  const jsPDF = requireJsPdf();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  const props = pdf.getImageProperties(dataUrl);
  const imgAr = props.width / props.height;
  const pageAr = pageW / pageH;
  let w: number, h: number;
  if (imgAr > pageAr) {
    w = pageW; h = pageW / imgAr;
  } else {
    h = pageH; w = pageH * imgAr;
  }
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(dataUrl, 'PNG', x, y, w, h);
  return pdf.output('blob');
}

// Centre of each value box and the baseline point for the date on the
// "Date: ____" line. Measured from the compressed template (rates shifted
// upward to free space for promotions at the bottom).
const DATE_POINT = { x: 585, y: 668 };
const RATE_POINTS = [
  { key: '24k_999', x: 731, y: 778 },
  { key: '24k_995', x: 731, y: 914 },
  { key: '22k_916', x: 731, y: 1050 },
  { key: '18k_750', x: 731, y: 1186 },
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

/** e.g. "6:22 PM" — matches the manual formatting GoldRatePosterModal uses natively. */
function formatPosterTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
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
  // Native renders + shares the poster via GoldRatePosterModal.native.tsx; web
  // draws it on a DOM canvas here. Either way the button should be available.
  if (Platform.OS !== 'web') return true;
  return typeof document !== 'undefined' && typeof document.createElement === 'function' && !!getTemplateUri();
}

// Special-offer banner geometry (template pixel space) — the compressed
// template removed the bottom jewellery/tagline, so the promo area is much
// larger: 197px of clean space between the last rate row and the T&C line.
const OFFER = { x: 130, y: 1254, w: 794, h: 177, r: 18 };

/** Word-wrap `text` to fit `maxWidth` at the current ctx font, capped at
 *  `maxLines` (excess is ellipsised onto the last line). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line) lines.push(line);
  // Anything left over after the line cap: append with an ellipsis, trimming
  // characters until it fits.
  const consumed = lines.join(' ').length;
  if (consumed < text.length && lines.length >= maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.slice(0, maxLines);
}

/** Draw the poster (template + overlaid date & rates) onto a fresh canvas. */
function renderPosterCanvas(img: HTMLImageElement, rates: PosterRates, date: Date, scale: number, promo?: string | null): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = TPL_W * scale;
  canvas.height = TPL_H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. Draw the exact template as the background.
  ctx.drawImage(img, 0, 0, TPL_W * scale, TPL_H * scale);
  ctx.fillStyle = GOLD;

  // 2. Date + time on the "Date:" line. Slightly smaller than the old
  // date-only size (30px) so the combined string comfortably fits the open
  // background to the right of "Date:" without crowding the label.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${Math.round(26 * scale)}px Georgia, "Playfair Display", serif`;
  ctx.fillText(`${formatPosterDate(date)}  ·  ${formatPosterTime(date)}`, DATE_POINT.x * scale, DATE_POINT.y * scale);
  ctx.restore();

  // 3. Each rate value, centred in its box (whole rupees, prefixed with ₹).
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(40 * scale)}px "Outfit", "Poppins", Arial, sans-serif`;
  for (const pt of RATE_POINTS) {
    const value = rates[pt.key as keyof PosterRates];
    if (!(value > 0)) continue;
    ctx.fillText(`₹ ${Math.round(value).toLocaleString('en-IN')}/-`, pt.x * scale, pt.y * scale);
  }
  ctx.restore();

  // 4. Special-offer text — no background box; golden gradient text directly
  //    on the template, clearly visible against the dark poster bottom.
  const offer = promo?.trim();
  if (offer) {
    ctx.save();
    const x = OFFER.x * scale, y = OFFER.y * scale, w = OFFER.w * scale, h = OFFER.h * scale;
    const centerX = x + w / 2;
    const innerPad = 24 * scale;

    // Golden gradient used for all promo text
    const goldGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    goldGrad.addColorStop(0, '#F2D98A');
    goldGrad.addColorStop(0.5, '#E0B55A');
    goldGrad.addColorStop(1, '#C8963E');

    // "TODAY'S OFFER" kicker
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = goldGrad;
    ctx.font = `800 ${Math.round(18 * scale)}px Arial, sans-serif`;
    ctx.fillText("✦  T O D A Y ' S   O F F E R  ✦", centerX, y + 20 * scale);

    // Promo body — auto-size font to fit all text in the available area.
    const kickerH = 36 * scale;
    const padBottom = 12 * scale;
    const availH = h - kickerH - padBottom;
    const maxW = w - innerPad * 2;
    let fontSize = 16;
    let lines: string[] = [];
    let lineH = 0;
    while (fontSize >= 9) {
      ctx.font = `700 ${Math.round(fontSize * scale)}px Arial, sans-serif`;
      lineH = Math.round((fontSize + 4) * scale);
      const maxLines = Math.floor(availH / lineH);
      lines = wrapText(ctx, offer, maxW, maxLines);
      const allText = lines.join(' ');
      const allFits = allText.length >= offer.replace(/\s+/g, ' ').trim().length * 0.95;
      if (allFits && lines.length * lineH <= availH) break;
      fontSize--;
    }
    const blockBottom = y + h - padBottom;
    const firstLineY = blockBottom - lineH * (lines.length - 1);
    lines.forEach((ln, i) => ctx.fillText(ln, centerX, firstLineY + i * lineH));
    ctx.restore();
  }
  return canvas;
}

/**
 * Generate the poster and hand it to the user — the share sheet on mobile
 * (which saves to Photos on iOS, where an <a download> is ignored) or a file
 * download on desktop.
 * @param scale render multiplier (1 = native 1054x1492; 2 = higher-res print).
 */
export function downloadGoldRatePoster(rates: PosterRates, date = new Date(), scale = 2, promo?: string | null): void {
  if (!isPosterSupported()) return;
  const img = getTemplateImage();
  if (!img) return;

  const fileName = `indriya_gold_rates_${date.toISOString().slice(0, 10)}.pdf`;
  const run = () => {
    try {
      const canvas = renderPosterCanvas(img, rates, date, scale, promo);
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
