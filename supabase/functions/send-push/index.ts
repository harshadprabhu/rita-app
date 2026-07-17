import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Sends an OS push notification to RITA users via Firebase Cloud Messaging.
// Called by DB triggers (new broadcast / new notification row).
//
//   { "title": "...", "body": "...",
//     "user_ids": [...] | null,     // specific recipients
//     "store_ids": [...] | null,    // a store audience
//     "data": { ... } | null }      // deep-link payload (e.g. { ticketId })
//
// Talks to FCM directly with a service-account key (FCM_SERVICE_ACCOUNT) —
// nothing routes through Expo's push service, since the APK is built with
// prebuild + Gradle rather than EAS. profiles.expo_push_token holds the raw
// FCM device token (getDevicePushTokenAsync on the client).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// ---- Google OAuth (JWT bearer) -------------------------------------------

function b64url(input: string | Uint8Array): string {
  const bin = typeof input === 'string'
    ? input
    : Array.from(input).map((b) => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Sign a JWT with the service account key and exchange it for an access token. */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = await res.json().catch(() => ({}));
  const tok = (json as { access_token?: string }).access_token;
  if (!tok) throw new Error(`FCM auth failed: ${JSON.stringify(json).slice(0, 300)}`);
  return tok;
}

// ---- FCM send ------------------------------------------------------------

/** FCM data values must all be strings. */
function stringifyData(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ?probe=1 — verify the service account parses, signs, and exchanges for an
    // access token, without needing a registered device. Sends nothing.
    if (new URL(req.url).searchParams.get('probe') === '1') {
      const rawSa = Deno.env.get('FCM_SERVICE_ACCOUNT');
      if (!rawSa) throw new Error('FCM_SERVICE_ACCOUNT not set');
      const saProbe = JSON.parse(rawSa) as ServiceAccount;
      const tok = await getAccessToken(saProbe);
      return new Response(JSON.stringify({
        ok: true,
        project_id: saProbe.project_id,
        client_email: saProbe.client_email,
        accessTokenAcquired: tok.length > 20,
      }, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { title, body, store_ids, user_ids, data } = await req.json().catch(() => ({})) as {
      title?: string; body?: string;
      store_ids?: string[] | null; user_ids?: string[] | null;
      data?: Record<string, unknown>;
    };
    if (!title || !body) {
      return new Response(JSON.stringify({ ok: false, error: 'title and body required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, error: 'FCM_SERVICE_ACCOUNT not configured' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const sa = JSON.parse(raw) as ServiceAccount;

    // Resolve recipients. user_ids targets specific people (per-notification);
    // store_ids targets a store audience (broadcasts); neither => everyone.
    let q = supabase.from('profiles').select('id, expo_push_token').not('expo_push_token', 'is', null).eq('is_active', true);
    if (Array.isArray(user_ids) && user_ids.length) q = q.in('id', user_ids);
    else if (Array.isArray(store_ids) && store_ids.length) q = q.in('store_id', store_ids);
    const { data: rows, error } = await q;
    if (error) throw error;

    const targets = (rows ?? []) as { id: string; expo_push_token: string }[];
    if (!targets.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no_tokens' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const accessToken = await getAccessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const payloadData = stringifyData(data);

    let sent = 0;
    const stale: string[] = [];

    // FCM v1 is one message per token; send in small concurrent batches.
    for (let i = 0; i < targets.length; i += 20) {
      const chunk = targets.slice(i, i + 20);
      await Promise.all(chunk.map(async (t) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.expo_push_token,
              notification: { title, body },
              data: payloadData,
              android: {
                priority: 'HIGH',
                notification: { channel_id: 'default', sound: 'default' },
              },
            },
          }),
        }).catch(() => null);

        if (!res) return;
        if (res.ok) { sent++; return; }

        const errText = await res.text().catch(() => '');
        // The device uninstalled / token rotated — drop it so we stop trying.
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(errText)) {
          stale.push(t.id);
        } else {
          console.warn('[send-push] FCM', res.status, errText.slice(0, 200));
        }
      }));
    }

    if (stale.length) {
      await supabase.from('profiles').update({ expo_push_token: null }).in('id', stale);
    }

    return new Response(JSON.stringify({ ok: true, sent, targeted: targets.length, cleared: stale.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[send-push]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
