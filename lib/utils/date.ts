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

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return i18n.t('time.secondsAgo', { n: diff });
  if (diff < 3600) return i18n.t('time.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t('time.hoursAgo', { n: Math.floor(diff / 3600) });
  return i18n.t('time.daysAgo', { n: Math.floor(diff / 86400) });
}
