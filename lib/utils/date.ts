import i18n from '../i18n';

// Map the active app language to a BCP-47 locale for Intl date formatting.
// Falls back to Indian English so month/day formatting stays consistent.
function activeLocale(): string {
  switch (i18n.language) {
    case 'hi': return 'hi-IN';
    case 'mr': return 'mr-IN';
    default: return 'en-IN';
  }
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(activeLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Time-only, e.g. "6:22 PM" — for pairing with a relative "X ago" string. */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' });
}

/**
 * Compact human duration between two ISO timestamps, tuned for
 * ticket resolution time: "43m", "3h 12m", "2d 4h". Under a minute →
 * "less than 1m". Returns null if either timestamp is missing.
 */
export function formatDurationBetween(fromIso: string | null | undefined, toIso: string | null | undefined): string | null {
  if (!fromIso || !toIso) return null;
  const seconds = Math.max(0, Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));
  return formatDurationSeconds(seconds);
}

export function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) return 'less than 1m';
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600) % 24;
  const d = Math.floor(seconds / 86400);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return i18n.t('time.secondsAgo', { n: diff });
  if (diff < 3600) return i18n.t('time.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t('time.hoursAgo', { n: Math.floor(diff / 3600) });
  return i18n.t('time.daysAgo', { n: Math.floor(diff / 86400) });
}
