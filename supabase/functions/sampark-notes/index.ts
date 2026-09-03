import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Proxy for a RITA ticket's Sampark notes — GET lists them, POST adds one.
// Sampark is the single source of truth for the chat, so RITA no longer
// stores comment bodies in ticket_comments; it fetches them on demand and
// caches them in AsyncStorage on the device. Only the ticket→sampark_request_id
// mapping is looked up in the DB here; everything else round-trips Sampark.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SDP_ACCEPT = 'application/vnd.manageengine.sdp.v3+json';

interface Cfg { serviceUrl: string; portal: string; dataCenter: string; clientId: string; clientSecret: string; refreshToken: string; }

async function loadCfg(supabase: ReturnType<typeof createClient>): Promise<Cfg> {
  const { data } = await supabase.from('integration_settings')
    .select('sampark_service_url, sampark_portal, sampark_data_center').eq('id', 1).maybeSingle();
  const row = (data ?? {}) as Record<string, string | null>;
  return {
    serviceUrl: String(row.sampark_service_url || 'https://sdpondemand.manageengine.in').replace(/\/+$/, ''),
    portal: String(row.sampark_portal || 'itdesk'),
    dataCenter: String(row.sampark_data_center || 'in'),
    clientId: Deno.env.get('SAMPARK_CLIENT_ID') || '',
    clientSecret: Deno.env.get('SAMPARK_CLIENT_SECRET') || '',
    refreshToken: Deno.env.get('SAMPARK_REFRESH_TOKEN') || '',
  };
}

// Uses the DB-cached Zoho access token when it's still valid for ≥5 minutes,
// otherwise refreshes once and writes the new pair back. Every edge fn +
// every instance shares the same cache row, so even a 3s live-chat poll
// refreshes Zoho at most ~once per hour — well under Zoho's OAuth rate cap.
async function getToken(cfg: Cfg, supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: cached } = await supabase
    .from('integration_settings')
    .select('sampark_access_token, sampark_access_expires_at')
    .eq('id', 1).maybeSingle();
  const cachedRow = (cached ?? {}) as { sampark_access_token?: string | null; sampark_access_expires_at?: string | null };
  if (cachedRow.sampark_access_token && cachedRow.sampark_access_expires_at) {
    const expiresMs = new Date(cachedRow.sampark_access_expires_at).getTime();
    if (expiresMs - Date.now() > 5 * 60 * 1000) {
      return cachedRow.sampark_access_token;
    }
  }
  const body = new URLSearchParams({
    refresh_token: cfg.refreshToken, client_id: cfg.clientId,
    client_secret: cfg.clientSecret, grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, { method: 'POST', body });
  const text = await res.text();
  if (!res.ok) throw new Error(`token refresh ${res.status}: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text);
  const t = parsed.access_token as string | undefined;
  if (!t) throw new Error(`token refresh no access_token: ${text.slice(0, 400)}`);
  const expiresInSec = Number(parsed.expires_in) || 3600;
  // Store slightly before actual expiry so pinning near-expiry callers doesn't race.
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  await supabase.from('integration_settings')
    .update({ sampark_access_token: t, sampark_access_expires_at: expiresAt })
    .eq('id', 1);
  return t;
}

/**
 * Simplified note shape returned to the app — same regardless of direction.
 * Sampark's raw structure is huge; we distill it to what the UI actually
 * needs so the local AsyncStorage cache stays lean.
 */
interface AppMedia {
  name: string;
  contentType: string;      // e.g. image/jpeg, video/mp4, application/pdf
  url: string;              // proxy URL back through THIS function (needs app auth)
  kind: 'image' | 'video' | 'document';
}
interface AppNote {
  id: string;               // Sampark's note id
  author: string;           // "Yajuvender Rawat" or "harshad prabhu (RITA)"
  authorEmail: string | null;
  body: string;             // Description with HTML stripped
  createdAt: string;        // ISO timestamp
  fromRita: boolean;        // Was this note written from the RITA app side?
  showToRequester: boolean; // Public vs. internal in Sampark
  media?: AppMedia | null;  // attached file, if this note carries one
}

// A note that carries a file is posted with a plain-ASCII marker in the body:
// "[file] <filename>". ASCII (not an emoji) so it survives every encoding hop
// through URLSearchParams → Sampark → GET intact. The 📎 shown to the
// technician is appended AFTER the marker so their view still reads nicely.
const MEDIA_MARKER = '[file]';
function mediaKind(contentType: string, name: string): 'image' | 'video' | 'document' {
  const ct = (contentType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp)$/.test(n)) return 'image';
  if (ct.startsWith('video/') || /\.(mp4|mov|m4v|3gp|webm|avi)$/.test(n)) return 'video';
  return 'document';
}

// Handles two SDP shapes:
//  - /notes items:            { description, created_by, created_time, show_to_requester }
//  - /notifications REQREPLY: { description, sender,     time,         is_public }
function normalize(raw: Record<string, unknown>): AppNote {
  const rawDesc = String((raw.description as string) || '');
  // REQREPLY bodies are full HTML emails (contenteditable divs, quoted
  // history, etc.). Strip tags AND collapse any lines after the first
  // "On <date>, <name> wrote:" quote — the reply above the quote is what
  // the user actually typed.
  const stripped = rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const quotedIdx = stripped.search(/^On\s+.+\swrote:$/mi);
  const description = (quotedIdx > 0 ? stripped.slice(0, quotedIdx) : stripped).trim();

  const author = (raw.created_by as any) ?? (raw.sender as any) ?? {};
  const authorName = String(author?.name || 'Support');
  const authorEmail = (author?.email_id as string) ?? null;

  const ritaMatch = description.match(/^(.+?)\s+\(RITA\):\s*(.*)$/s);
  const fromRita = !!ritaMatch;
  const body = fromRita ? ritaMatch![2].trim() : description;
  const displayAuthor = fromRita ? ritaMatch![1].trim() : authorName;

  const timeVal = ((raw.created_time as any)?.value ?? (raw.time as any)?.value) as string | undefined;
  const createdAt = timeVal ? new Date(Number(timeVal)).toISOString() : new Date().toISOString();
  const visible = (raw.show_to_requester as boolean | undefined) ?? (raw.is_public as boolean | undefined) ?? true;

  return {
    id: String(raw.id),
    author: displayAuthor,
    authorEmail,
    body,
    createdAt,
    fromRita,
    showToRequester: visible !== false,
  };
}

async function resolveRequestId(
  supabase: ReturnType<typeof createClient>,
  ticketId: string,
): Promise<{ requestId: string; err?: undefined } | { requestId?: undefined; err: string }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('sampark_request_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (error) return { err: `db lookup failed: ${error.message}` };
  const req = (data as { sampark_request_id?: string } | null)?.sampark_request_id;
  if (!req) return { err: 'ticket has no sampark_request_id yet (still syncing)' };
  return { requestId: req };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Public URL of THIS function — req.url inside the edge runtime points at an
  // internal host missing /functions/v1, so build the proxy base from the
  // project URL instead. Attachment links are rendered by the app against this.
  const selfUrl = `${(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')}/functions/v1/sampark-notes`;

  try {
    const cfg = await loadCfg(supabase);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const ticketId = url.searchParams.get('ticket_id') ?? '';
      if (!ticketId) {
        return new Response(JSON.stringify({ error: 'ticket_id required' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const r = await resolveRequestId(supabase, ticketId);
      if (r.err) return new Response(JSON.stringify({ error: r.err }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      const token = await getToken(cfg, supabase);

      // ── Attachment proxy ──────────────────────────────────────────────
      // Sampark attachment bytes require the Zoho token, which the app must
      // never hold. So the app requests `?ticket_id=…&file_id=…` and we stream
      // the file back over the app's own (already-authorized) call. Images/
      // videos render inline; documents download.
      const fileId = url.searchParams.get('file_id');
      if (fileId) {
        const up = await fetch(
          `${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${r.requestId}/_uploads/${encodeURIComponent(fileId)}`,
          { headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT } },
        );
        if (!up.ok) {
          return new Response(JSON.stringify({ error: `attachment ${up.status}` }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const ct = up.headers.get('content-type') || 'application/octet-stream';
        return new Response(up.body, {
          headers: { ...CORS, 'Content-Type': ct, 'Cache-Control': 'private, max-age=3600' },
        });
      }

      const sdp = async (path: string): Promise<any> => {
        const rr = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3${path}`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
        });
        const t = await rr.text();
        if (!rr.ok) throw new Error(`GET ${path} ${rr.status}: ${t.slice(0, 200)}`);
        return JSON.parse(t);
      };


      // 1) /notes — the "Notes" tab in Sampark. Contains RITA-authored
      //    messages (posted via POST below) + any note a technician typed
      //    directly on the Notes tab.
      let notesFromApi: Record<string, unknown>[] = [];
      try {
        const notesJson = await sdp(
          `/requests/${r.requestId}/notes?input_data=${encodeURIComponent(JSON.stringify({ list_info: { row_count: 200 } }))}`,
        );
        notesFromApi = (notesJson.notes ?? []) as Record<string, unknown>[];
      } catch (e) { console.warn('[sampark-notes] notes fetch failed:', e); }

      // 2) /conversations — the email-thread items on the request. This is
      //    where technician REPLIES (type=REQREPLY) live. Sampark's chat
      //    UX makes technicians "Reply" more often than "Add Note", so
      //    without this we miss most of the actual chat.
      let repliesFromApi: Record<string, unknown>[] = [];
      try {
        const convJson = await sdp(`/requests/${r.requestId}/conversations`);
        const convs = (convJson.conversations ?? []) as Record<string, any>[];
        // Only visible technician replies count — skip system emails
        // (RequesterAck_E-Mail, Technician_E-Mail, REQESCALATION, etc.)
        const visibleReplies = convs.filter((c) => c.type === 'REQREPLY' && c.show_to_requester !== false);
        for (const c of visibleReplies) {
          try {
            const detailJson = await sdp(`/requests/${r.requestId}/notifications/${c.id}`);
            const n = detailJson.notification;
            if (n) repliesFromApi.push(n as Record<string, unknown>);
          } catch (e) { console.warn('[sampark-notes] reply detail failed:', c.id, e); }
        }
      } catch (e) { console.warn('[sampark-notes] conversations fetch failed:', e); }

      // 3) request.attachments — files uploaded to the request (incl. ones we
      //    attach to a note via POST below). SDP doesn't return a note→file
      //    link on GET, so we match a "📎 <filename>" media note to its file
      //    by name (claiming each file once, newest first, to survive dup
      //    names). Every attachment carries a proxy URL the app can fetch.
      let attachments: { file_id: string; name: string; content_type: string }[] = [];
      try {
        const reqJson = await sdp(`/requests/${r.requestId}`);
        attachments = ((reqJson.request?.attachments ?? []) as Record<string, any>[])
          .map((a) => ({ file_id: String(a.file_id ?? ''), name: String(a.name ?? ''), content_type: String(a.content_type ?? '') }))
          .filter((a) => a.file_id);
      } catch (e) { console.warn('[sampark-notes] attachments fetch failed:', e); }

      // Merge, dedupe by id, sort oldest-first for natural chat append.
      const seen = new Set<string>();
      const merged: AppNote[] = [];
      for (const raw of [...notesFromApi, ...repliesFromApi]) {
        const n = normalize(raw);
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        merged.push(n);
      }
      merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      // Attach media to marker notes. Process newest-first so the most recent
      // upload of a dup-named file binds to the most recent marker note.
      const claimed = new Set<string>();
      const findFile = (name: string) => {
        for (let i = attachments.length - 1; i >= 0; i--) {
          const a = attachments[i];
          if (a.name === name && !claimed.has(a.file_id)) { claimed.add(a.file_id); return a; }
        }
        return null;
      };
      for (let i = merged.length - 1; i >= 0; i--) {
        const n = merged[i];
        const body = n.body.trim();
        const mIdx = body.indexOf(MEDIA_MARKER);
        if (mIdx < 0) continue;
        // filename is everything after the marker (drop a leading 📎 if present)
        const fname = body.slice(mIdx + MEDIA_MARKER.length).replace(/^\s*📎?\s*/, '').trim();
        const file = findFile(fname);
        if (!file) continue;
        n.media = {
          name: file.name,
          contentType: file.content_type,
          url: `${selfUrl}?ticket_id=${encodeURIComponent(ticketId)}&file_id=${encodeURIComponent(file.file_id)}`,
          kind: mediaKind(file.content_type, file.name),
        };
        n.body = ''; // marker text is replaced by the rendered media
      }

      return new Response(JSON.stringify({ ok: true, notes: merged }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';

      // ── File upload (multipart) ───────────────────────────────────────
      // Upload the file to Sampark's request, then post a note that carries
      // it + a "📎 <filename>" marker body so it renders as a chat message
      // AND the technician sees the file in Sampark. Two-step per SDP v3.
      if (contentType.includes('multipart/form-data')) {
        const fd = await req.formData();
        const ticketId = String(fd.get('ticket_id') ?? '');
        const requesterName = String(fd.get('requester_name') ?? '');
        const file = fd.get('file');
        if (!ticketId || !(file instanceof File)) {
          return new Response(JSON.stringify({ error: 'ticket_id and file required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const r = await resolveRequestId(supabase, ticketId);
        if (r.err) return new Response(JSON.stringify({ error: r.err }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
        const token = await getToken(cfg, supabase);

        // 1) upload the bytes → attaches to the request, returns a file id
        const upForm = new FormData();
        upForm.append('filename', file, file.name || `upload_${Date.now()}`);
        upForm.append('addtoattachment', 'true');
        const upRes = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${r.requestId}/_uploads`, {
          method: 'POST',
          headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT },
          body: upForm,
        });
        const upText = await upRes.text();
        if (!upRes.ok) {
          return new Response(JSON.stringify({ error: `upload ${upRes.status}`, detail: upText.slice(0, 400) }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const uploaded = (JSON.parse(upText).files ?? [])[0] ?? {};
        const fileId = String(uploaded.file_id ?? uploaded.id ?? '');
        const attId = String(uploaded.id ?? '');
        const fname = String(uploaded.name ?? file.name ?? 'file');

        // 2) post a note carrying the file + the media marker body
        // Pure ASCII — Sampark truncates a note description at an emoji, which
        // silently dropped the filename. "[file] <name>" reads fine for the
        // technician and round-trips intact.
        const authoredBody = requesterName
          ? `${requesterName} (RITA): ${MEDIA_MARKER} ${fname}`
          : `${MEDIA_MARKER} ${fname}`;
        const noteForm = new URLSearchParams({
          input_data: JSON.stringify({
            request_note: {
              description: authoredBody,
              show_to_requester: true,
              mark_first_response: false,
              add_to_linked_requests: false,
              notify_technician: false,
              ...(attId ? { attachments: [{ id: attId }] } : {}),
            },
          }),
        });
        const noteRes = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${r.requestId}/notes`, {
          method: 'POST',
          headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: SDP_ACCEPT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: noteForm,
        });
        const noteText = await noteRes.text();
        if (!noteRes.ok) {
          return new Response(JSON.stringify({ error: `note ${noteRes.status}`, detail: noteText.slice(0, 400) }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const noteRaw = JSON.parse(noteText).request_note ?? {};
        const note = normalize(noteRaw);
        note.body = '';
        note.media = {
          name: fname,
          contentType: String(uploaded.content_type ?? file.type ?? 'application/octet-stream'),
          url: `${selfUrl}?ticket_id=${encodeURIComponent(ticketId)}&file_id=${encodeURIComponent(fileId)}`,
          kind: mediaKind(String(uploaded.content_type ?? file.type ?? ''), fname),
        };
        return new Response(JSON.stringify({ ok: true, note }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      const payload = await req.json().catch(() => ({}));
      const { ticket_id, body, requester_name } = payload as { ticket_id?: string; body?: string; requester_name?: string };
      if (!ticket_id || !body?.trim()) {
        return new Response(JSON.stringify({ error: 'ticket_id and body required' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const r = await resolveRequestId(supabase, ticket_id);
      if (r.err) return new Response(JSON.stringify({ error: r.err }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      const token = await getToken(cfg, supabase);
      // Prefix with `<user> (RITA):` so the normalize() step on any subsequent
      // GET flags it as fromRita — same convention sampark-comment-push used.
      const authoredBody = requester_name ? `${requester_name} (RITA): ${body.trim()}` : body.trim();
      // SDP v3 wants `request_note` as the wrapper key, NOT `note`. Confirmed
      // live: `{"note": …}` returns 400 EXTRA_KEY_FOUND_IN_JSON (field=note),
      // which the app previously swallowed — the composer cleared, the POST
      // silently failed, and nothing appeared in chat. Old working payload is
      // preserved verbatim from the retired sampark-comment-push fn.
      const form = new URLSearchParams({
        input_data: JSON.stringify({
          request_note: {
            description: authoredBody,
            show_to_requester: true,
            mark_first_response: false,
            add_to_linked_requests: false,
            notify_technician: false,
          },
        }),
      });
      const posted = await fetch(`${cfg.serviceUrl}/app/${cfg.portal}/api/v3/requests/${r.requestId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: SDP_ACCEPT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
      const text = await posted.text();
      if (!posted.ok) {
        return new Response(JSON.stringify({ error: `sampark ${posted.status}`, detail: text.slice(0, 500) }), {
          status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const json = JSON.parse(text);
      // Response mirrors the request wrapper: `request_note` on POST, not `note`.
      const raw = json.request_note ?? json.note ?? {};
      return new Response(JSON.stringify({ ok: true, note: normalize(raw) }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sampark-notes]', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
