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
  /** Client-only transient flag. True on the optimistic echo of a message
   *  we just POSTed, before a fresh Sampark GET confirms it round-tripped.
   *  Never set by the server — used to drive the "sent" (single-tick) state.
   *  Once the note comes back from Sampark GET it's absent → "delivered". */
  pending?: boolean;
}

// Direct fetch against the edge function. We deliberately DON'T use
// supabase.functions.invoke here: its wrapper (a) strips the query string on
// GET, and (b) was intermittently returning a FunctionsFetchError under rapid
// sends that left the send mutation stuck "pending" (button greyed, "failed to
// send a request to the Edge Function"). A plain fetch with an explicit
// AbortController timeout is reliable, gives a real HTTP status, and can never
// hang the UI forever.
function functionsUrl(path: string): string {
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/functions/v1/${path}`;
}

async function authToken(): Promise<string> {
  const session = (await supabase.auth.getSession()).data.session;
  return session?.access_token ?? (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getSamparkNotes(ticketId: string): Promise<SamparkNote[]> {
  const token = await authToken();
  const url = `${functionsUrl('sampark-notes')}?ticket_id=${encodeURIComponent(ticketId)}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Couldn't load chat (${res.status}) ${text.slice(0, 120)}`);
  }
  const json = await res.json();
  return (json.notes ?? []) as SamparkNote[];
}

export async function addSamparkNote(
  ticketId: string,
  body: string,
  requesterName: string | null,
): Promise<SamparkNote> {
  const token = await authToken();
  const res = await fetchWithTimeout(functionsUrl('sampark-notes'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId, body, requester_name: requesterName }),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    // Surface Sampark's own message where possible so it's diagnosable.
    let detail = text.slice(0, 160);
    try { const j = JSON.parse(text); detail = j.error || j.detail || detail; } catch { /* keep raw */ }
    throw new Error(`Message not sent (${res.status}): ${detail}`);
  }
  const note = (JSON.parse(text) as { note?: SamparkNote })?.note;
  if (!note) throw new Error('Message not sent: Sampark returned no note');
  return note;
}
