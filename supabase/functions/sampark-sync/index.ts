import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ManageEngine ServiceDesk Plus Cloud (Sampark) integration — server side.
//
// Modes (query param):
//   ?probe=1        — OAuth check + report categories / a sample request shape
//   (default)       — sync categories + subcategories into ticket_categories
//
// Auth is Zoho OAuth: a stored refresh token is exchanged for a short-lived
// access token, passed as `Authorization: Zoho-oauthtoken <token>`.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SamparkConfig {
  serviceUrl: string;   // https://sdpondemand.manageengine.in
  portal: string;       // itdesk
  dataCenter: string;   // in
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

async function loadConfig(supabase: ReturnType<typeof createClient>): Promise<SamparkConfig> {
  const { data } = await supabase
    .from('integration_settings')
    .select('sampark_service_url, sampark_portal, sampark_data_center')
    .eq('id', 1)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, string | null>;
  return {
    serviceUrl: (row.sampark_service_url || 'https://sdpondemand.manageengine.in').replace(/\/+$/, ''),
    portal: row.sampark_portal || 'itdesk',
    dataCenter: row.sampark_data_center || 'in',
    clientId: Deno.env.get('SAMPARK_CLIENT_ID') || '',
    clientSecret: Deno.env.get('SAMPARK_CLIENT_SECRET') || '',
    refreshToken: Deno.env.get('SAMPARK_REFRESH_TOKEN') || '',
  };
}

async function getAccessToken(cfg: SamparkConfig): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error('Sampark OAuth credentials not configured');
  }
  const body = new URLSearchParams({
    refresh_token: cfg.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${cfg.dataCenter}/oauth/v2/token`, {
    method: 'POST',
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  if (!json.access_token) throw new Error(`Zoho token response had no access_token: ${text.slice(0, 200)}`);
  return json.access_token as string;
}

function apiBase(cfg: SamparkConfig): string {
  return `${cfg.serviceUrl}/app/${cfg.portal}/api/v3`;
}

// SDP v3 GET with the input_data list_info envelope.
async function sdpGet(cfg: SamparkConfig, token: string, path: string, listInfo?: unknown): Promise<any> {
  let url = `${apiBase(cfg)}${path}`;
  if (listInfo) {
    const params = new URLSearchParams({ input_data: JSON.stringify({ list_info: listInfo }) });
    url += `?${params.toString()}`;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/vnd.manageengine.sdp.v3+json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const probe = new URL(req.url).searchParams.get('probe') === '1';

  try {
    const cfg = await loadConfig(supabase);
    const token = await getAccessToken(cfg);

    // --- Probe: confirm auth + reveal categories and a sample request shape. ---
    if (probe) {
      const report: Record<string, unknown> = { tokenOk: true, apiBase: apiBase(cfg) };
      try {
        const cats = await sdpGet(cfg, token, '/categories', { row_count: 100 });
        const list = (cats.categories ?? []) as Record<string, unknown>[];
        report.categoryCount = list.length;
        report.categorySample = list.slice(0, 8).map((c) => ({ id: c.id, name: c.name }));
      } catch (e) {
        report.categoriesError = e instanceof Error ? e.message : String(e);
      }
      try {
        const reqs = await sdpGet(cfg, token, '/requests', {
          row_count: 3,
          sort_field: 'created_time',
          sort_order: 'desc',
          fields_required: ['subject', 'category', 'subcategory', 'status', 'created_time'],
        });
        const list = (reqs.requests ?? []) as Record<string, unknown>[];
        report.requestSample = list.map((r) => ({
          display_id: r.display_id,
          subject: r.subject,
          category: r.category,
          subcategory: r.subcategory,
        }));
      } catch (e) {
        report.requestsError = e instanceof Error ? e.message : String(e);
      }
      return new Response(JSON.stringify(report, null, 2), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // --- Derive the taxonomy from real incidents (the /categories metadata
    // endpoint needs a setup scope we don't have; the actually-used categories
    // are richer for our purposes anyway). Paginate recent requests, collect
    // distinct categories + subcategories, and aggregate subject keywords per
    // category for parser tuning. `?analyze=1` returns the keyword report.
    const analyze = new URL(req.url).searchParams.get('analyze') === '1';
    const maxPages = Number(new URL(req.url).searchParams.get('pages') ?? '20'); // 20 * 100 = 2000
    const STOP = new Set('the a an of to for in on at is are be not no and or with without your you it its this that from into request please issue problem unable able cannot can get getting got need needs error not working help kindly regarding as we are our i am has have had will shall'.split(' '));

    const catMap = new Map<string, string>();          // id → name
    const subMap = new Map<string, { name: string; parent: string }>();
    const kw = new Map<string, Map<string, number>>(); // category name → word → count
    let scanned = 0;

    for (let page = 0; page < maxPages; page++) {
      const res = await sdpGet(cfg, token, '/requests', {
        row_count: 100,
        start_index: page * 100 + 1,
        sort_field: 'created_time',
        sort_order: 'desc',
        fields_required: ['subject', 'category', 'subcategory'],
      });
      const list = (res.requests ?? []) as Record<string, any>[];
      for (const r of list) {
        scanned++;
        const cat = r.category as { id?: string; name?: string } | null;
        const sub = r.subcategory as { id?: string; name?: string } | null;
        if (cat?.id && cat.name) catMap.set(String(cat.id), cat.name);
        if (sub?.id && sub.name && cat?.id) subMap.set(String(sub.id), { name: sub.name, parent: String(cat.id) });
        if (cat?.name && typeof r.subject === 'string') {
          const bucket = kw.get(cat.name) ?? new Map<string, number>();
          for (const w of r.subject.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)) {
            if (w.length < 3 || STOP.has(w)) continue;
            bucket.set(w, (bucket.get(w) ?? 0) + 1);
          }
          kw.set(cat.name, bucket);
        }
      }
      if (!(res.list_info?.has_more_rows)) break;
    }

    const rows = [
      ...[...catMap].map(([id, name]) => ({ id, name, parent_id: null as string | null, is_subcategory: false, is_active: true })),
      ...[...subMap].map(([id, v]) => ({ id, name: v.name, parent_id: v.parent, is_subcategory: true, is_active: true })),
    ];
    if (rows.length) {
      const { error } = await supabase.from('ticket_categories').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }

    const result: Record<string, unknown> = {
      ok: true,
      scanned,
      categories: catMap.size,
      subcategories: subMap.size,
    };
    if (analyze) {
      result.keywords = Object.fromEntries(
        [...kw].map(([cat, words]) => [
          cat,
          [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w, n]) => `${w}:${n}`),
        ]),
      );
    }
    return new Response(JSON.stringify(result, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sampark-sync] error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
