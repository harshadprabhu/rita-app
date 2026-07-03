// Generates a downloadable "Today's Gold Rates" poster (Indriya branded) entirely
// on an HTML canvas — no external template asset needed. Ported from the AI Studio
// issue-tracker build's procedural poster renderer. Web-only (uses the DOM canvas +
// anchor download); guarded so native/SSR callers no-op safely.

export interface PosterRates {
  '24k_999': number;
  '24k_995': number;
  '22k_916': number;
  '18k_750': number;
}

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

const W = 1200;
const H = 1600;
const GOLD = '#f0d27b';

export function isPosterSupported(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/**
 * Render the poster with the given rates + date and trigger a PNG download.
 * @param scale render multiplier (1 = 1200x1600 digital, 2.5 = 4K print).
 */
export function downloadGoldRatePoster(rates: PosterRates, date = new Date(), scale = 1): void {
  if (!isPosterSupported()) return;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rows = [
    { label: '24K per Gram', ppt: '(999)', price: rates['24k_999'], y: 684 },
    { label: '24K per Gram', ppt: '(995)', price: rates['24k_995'], y: 839 },
    { label: '22K per Gram', ppt: '(916)', price: rates['22k_916'], y: 994 },
    { label: '18K per Gram', ppt: '(750)', price: rates['18k_750'], y: 1149 },
  ];

  // 1. Deep navy background
  ctx.fillStyle = '#0d3f66';
  ctx.fillRect(0, 0, W * scale, H * scale);

  // 2. indriya.com top-left
  ctx.save();
  ctx.fillStyle = 'rgba(245, 223, 163, 0.65)';
  ctx.font = `600 ${Math.round(20 * scale)}px "Playfair Display", Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.fillText('indriya.com', 70 * scale, 70 * scale);
  ctx.restore();

  // 3. Deer + INDRIYA + ADITYA BIRLA | JEWELLERY
  ctx.save();
  ctx.translate((600 - 250) * scale, (225 - 100) * scale);
  ctx.font = `${Math.round(90 * scale)}px sans-serif`;
  ctx.fillText('🦌', 0, 75 * scale); // 🦌
  ctx.textAlign = 'left';
  ctx.fillStyle = GOLD;
  ctx.font = `bold ${Math.round(76 * scale)}px "Playfair Display", Cinzel, Georgia, serif`;
  ctx.fillText('INDRIYA', 140 * scale, 30 * scale);
  ctx.strokeStyle = 'rgba(240, 210, 123, 0.4)';
  ctx.lineWidth = Math.round(1.2 * scale);
  ctx.beginPath();
  ctx.moveTo(145 * scale, 50 * scale);
  ctx.lineTo(545 * scale, 50 * scale);
  ctx.stroke();
  ctx.font = `bold ${Math.round(20.5 * scale)}px Poppins, Inter, sans-serif`;
  ctx.fillText('ADITYA BIRLA  |  JEWELLERY', 140 * scale, 88 * scale);
  ctx.restore();

  // 4. Today's Gold Rates* header + divider
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5dfa3';
  ctx.font = `italic bold ${Math.round(52 * scale)}px "Playfair Display", Georgia, serif`;
  ctx.fillText("Today's Gold Rates*", 600 * scale, 395 * scale);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.round(1.5 * scale);
  ctx.beginPath();
  ctx.moveTo(400 * scale, 437 * scale);
  ctx.lineTo(575 * scale, 437 * scale);
  ctx.moveTo(625 * scale, 437 * scale);
  ctx.lineTo(800 * scale, 437 * scale);
  ctx.stroke();
  ctx.font = `${Math.round(18 * scale)}px sans-serif`;
  ctx.fillText('🦌', 600 * scale, 442 * scale);
  ctx.restore();

  // 5. Date centered + underline
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = `bold ${Math.round(30 * scale)}px Outfit, Poppins, Inter, sans-serif`;
  ctx.fillText(formatPosterDate(date), 600 * scale, 512 * scale);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.round(2.5 * scale);
  ctx.beginPath();
  ctx.moveTo(480 * scale, 528 * scale);
  ctx.lineTo(720 * scale, 528 * scale);
  ctx.stroke();
  ctx.restore();

  // 6. Four rate rows: gold badge + ₹ outline box + value + star
  rows.forEach((row) => {
    const radius = 18 * scale;

    // Gold badge (left)
    const bx = 160 * scale, by = (row.y - 55) * scale, bw = 390 * scale, bh = 110 * scale;
    const grad = ctx.createLinearGradient(bx, by, bx + bw, by);
    grad.addColorStop(0, '#cfab51');
    grad.addColorStop(0.5, '#f1df96');
    grad.addColorStop(1, '#b08d32');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, radius); else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e1401';
    ctx.font = `bold ${Math.round(24 * scale)}px Poppins, Inter, sans-serif`;
    ctx.fillText(row.label, bx + bw / 2, by + 48 * scale);
    ctx.font = `bold ${Math.round(16.5 * scale)}px "JetBrains Mono", monospace`;
    ctx.fillText(row.ppt, bx + bw / 2, by + 82 * scale);

    // Price outline box (right)
    const rx = 580 * scale, ry = (row.y - 55) * scale, rw = 460 * scale, rh = 110 * scale;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.round(2 * scale);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, radius); else ctx.rect(rx, ry, rw, rh);
    ctx.stroke();

    // ₹ symbol
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = GOLD;
    ctx.font = `bold ${Math.round(44 * scale)}px Poppins, Inter, sans-serif`;
    ctx.fillText('₹', rx + 42 * scale, ry + rh / 2);
    // Rate value, centered in the box
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(50 * scale)}px Outfit, Poppins, Inter, sans-serif`;
    ctx.fillText(`${row.price.toLocaleString('en-IN')}/-`, (835 + 30) * scale, ry + rh / 2);
    ctx.restore();

    // Corner star
    ctx.save();
    const sx = 1040 * scale, sy = ry;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.round(1 * scale);
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8 * scale); ctx.lineTo(sx, sy + 8 * scale);
    ctx.moveTo(sx - 8 * scale, sy); ctx.lineTo(sx + 8 * scale, sy);
    ctx.stroke();
    ctx.restore();
  });

  // 7. Tagline + T&C
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240, 210, 123, 0.7)';
  ctx.font = `italic ${Math.round(22 * scale)}px "Playfair Display", Georgia, serif`;
  ctx.fillText('Purity. Trust. Timeless.', 600 * scale, 1320 * scale);
  ctx.font = `${Math.round(18 * scale)}px Poppins, Inter, sans-serif`;
  ctx.fillText('Indriya — Where every sparkle tells a story.', 600 * scale, 1352 * scale);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(212, 175, 55, 0.5)';
  ctx.font = `bold ${Math.round(18 * scale)}px Poppins, Inter, sans-serif`;
  ctx.fillText('*T&C Apply.', (W - 80) * scale, (H - 64) * scale);
  ctx.restore();

  // Download
  try {
    const link = document.createElement('a');
    link.download = `indriya_gold_rates_${date.toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    // Export can throw if the canvas is tainted; nothing we draw taints it, so this is defensive.
  }
}
