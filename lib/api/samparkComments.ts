import { supabase } from '../supabase';

// Sampark is the single source of truth for the chat. Every read hits the
// live edge function which proxies Sampark; nothing is cached in RITA's DB
// or on device — matches the "chat like WhatsApp, but Sampark is the
// server" model the user asked for. The TicketDetail screen polls this on
// a short interval while the screen is focused so incoming Sampark notes
// appear without a manual refresh.

export interface SamparkNote {
  id: string;
  author: string;
  authorEmail: string | null;
  body: string;
  createdAt: string;
  fromRita: boolean;
  showToRequester: boolean;
}

export async function getSamparkNotes(ticketId: string): Promise<SamparkNote[]> {
  const { data, error } = await supabase.functions.invoke('sampark-notes', {
    method: 'GET',
    // supabase-js's invoke doesn't expose query params directly for GET, so
    // pass ticket_id through headers — the edge function reads it either way.
    // Actually: use body-less GET with query string via the raw URL builder.
    // Falling back to a body-in-GET is nonstandard; instead use the URL:
    // we hit supabase.functions.invoke with a manual fetch below.
  });
  if (!error && data) return (data as { notes: SamparkNote[] }).notes ?? [];
  // Fallback: direct fetch with query string. `invoke` in some client
  // versions strips the query part; a raw fetch preserves it.
  const url = new URL(`${supabaseFunctionsUrl()}/sampark-notes`);
  url.searchParams.set('ticket_id', ticketId);
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? getAnonKey();
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`sampark-notes GET failed: ${res.status}`);
  const json = await res.json();
  return (json.notes ?? []) as SamparkNote[];
}

export async function addSamparkNote(
  ticketId: string,
  body: string,
  requesterName: string | null,
): Promise<SamparkNote> {
  const { data, error } = await supabase.functions.invoke('sampark-notes', {
    method: 'POST',
    body: { ticket_id: ticketId, body, requester_name: requesterName },
  });
  if (error) throw new Error(error.message || 'sampark-notes POST failed');
  const note = (data as { note?: SamparkNote })?.note;
  if (!note) throw new Error('sampark-notes POST returned no note');
  return note;
}

// Helpers — kept local so this file has no cross-cutting deps.
function supabaseFunctionsUrl(): string {
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/functions/v1`;
}
function getAnonKey(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
}
