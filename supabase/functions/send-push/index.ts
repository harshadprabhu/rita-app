import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Sends an Expo push notification to RITA users. Called by DB triggers (new
// broadcast) and by sync-gold-rate (rate change). Body:
//   { "title": "...", "body": "...", "store_ids": ["00000119", ...] | null }
// When store_ids is given, only users in those stores are notified; otherwise
// everyone with a registered push token.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendExpo(messages: { to: string; title: string; body: string; data?: Record<string, unknown> }[]) {
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ ...m, sound: 'default', priority: 'high', channelId: 'default' }));
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    }).catch((e) => console.warn('[send-push] Expo send failed:', e));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const { title, body, store_ids, user_ids, data } = await req.json().catch(() => ({})) as {
      title?: string; body?: string; store_ids?: string[] | null; user_ids?: string[] | null; data?: Record<string, unknown>;
    };
    if (!title || !body) {
      return new Response(JSON.stringify({ ok: false, error: 'title and body required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    let q = supabase.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null).eq('is_active', true);
    // user_ids targets specific recipients (per-notification); store_ids targets
    // a store audience (broadcasts). Neither → everyone with a token.
    if (Array.isArray(user_ids) && user_ids.length) q = q.in('id', user_ids);
    else if (Array.isArray(store_ids) && store_ids.length) q = q.in('store_id', store_ids);
    const { data, error } = await q;
    if (error) throw error;

    const tokens = [...new Set((data ?? []).map((r: any) => r.expo_push_token).filter(Boolean))];
    if (!tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no_tokens' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    await sendExpo(tokens.map((to) => ({ to, title, body, data: data ?? {} })));
    return new Response(JSON.stringify({ ok: true, sent: tokens.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[send-push]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
