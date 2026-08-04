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
      const inspectId = new URL(req.url).searchParams.get('inspectId');
      if (inspectId) {
        // Ad-hoc single-request lookup (full detail, not the trimmed
        // fields_required list) — for diagnosing a specific ticket's fields
        // as Sampark actually stored them (e.g. who it shows as requester).
        try {
          const detail = await sdpGet(cfg, token, `/requests/${inspectId}`);
          return new Response(JSON.stringify(detail.request ?? detail, null, 2), {
            headers: { ...CORS, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
            status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
          });
        }
      }
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
          row_count: 10,
          sort_field: 'created_time',
          sort_order: 'desc',
          fields_required: ['subject', 'category', 'subcategory', 'item', 'status', 'created_time', 'priority'],
        });
        const list = (reqs.requests ?? []) as Record<string, unknown>[];
        report.requestSample = list.map((r) => ({
          display_id: r.display_id,
          subject: r.subject,
          category: r.category,
          subcategory: r.subcategory,
          item: r.item,
          priority: r.priority,
        }));
      } catch (e) {
        report.requestsError = e instanceof Error ? e.message : String(e);
      }
      try {
        const prios = await sdpGet(cfg, token, '/priorities', { row_count: 50 });
        const list = (prios.priorities ?? []) as Record<string, unknown>[];
        report.prioritySample = list.map((p) => ({ id: p.id, name: p.name }));
      } catch (e) {
        report.prioritiesError = e instanceof Error ? e.message : String(e);
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
    const qp = new URL(req.url).searchParams;
    const analyze = qp.get('analyze') === '1';
    const maxPages = Number(qp.get('pages') ?? '20'); // 20 * 100 = 2000
    // Optional created_time window (epoch millis) — e.g. a financial year.
    const from = qp.get('from');
    const to = qp.get('to');
    const dateCriteria = (from || to)
      ? [
          ...(from ? [{ field: 'created_time', condition: 'greater than', values: [from], logical_operator: 'and' }] : []),
          ...(to ? [{ field: 'created_time', condition: 'lesser than', values: [to] }] : []),
        ]
      : undefined;
    const STOP = new Set('the a an of to for in on at is are be not no and or with without your you it its this that from into request please issue problem unable able cannot can get getting got need needs error not working help kindly regarding as we are our i am has have had will shall'.split(' '));

    const catMap = new Map<string, string>();          // id → name
    const subMap = new Map<string, { name: string; parent: string }>();
    const itemMap = new Map<string, { name: string; parent: string }>(); // parent = subcategory id (or category id if no subcategory)
    // Keyword frequency per taxonomy node, keyed by "level|nodeId" (id, not
    // name, so identically-named nodes under different parents never collide).
    const kw = new Map<string, Map<string, number>>();
    let scanned = 0;

    // Per-ticket volume tally (distinct from `kw`, which is keyword frequency,
    // not ticket count) — powers `?analyze=1`'s `ticketCounts` report. "Other"/
    // "Others" is the parser's fallback default, so those tickets are excluded
    // from the count (an exact-name match, not a substring — "Other Id card
    // issue" is a real category and stays counted).
    const isOtherName = (name: string) => /^others?$/i.test(name.trim());
    const catTicketCount = new Map<string, number>();  // id → ticket count
    const subTicketCount = new Map<string, number>();
    const itemTicketCount = new Map<string, number>();
    let excludedOther = 0;

    const addKeywords = (key: string, subject: string) => {
      const bucket = kw.get(key) ?? new Map<string, number>();
      const words = subject.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
      for (const w of words) {
        bucket.set(w, (bucket.get(w) ?? 0) + 1);
      }
      // Bigrams — capture two-word phrases for more precise matching
      for (let i = 0; i < words.length - 1; i++) {
        const bg = `${words[i]} ${words[i + 1]}`;
        bucket.set(bg, (bucket.get(bg) ?? 0) + 1);
      }
      kw.set(key, bucket);
    };

    for (let page = 0; page < maxPages; page++) {
      const res = await sdpGet(cfg, token, '/requests', {
        row_count: 100,
        start_index: page * 100 + 1,
        sort_field: 'created_time',
        sort_order: 'desc',
        fields_required: ['subject', 'category', 'subcategory', 'item'],
        ...(dateCriteria ? { search_criteria: dateCriteria } : {}),
      });
      const list = (res.requests ?? []) as Record<string, any>[];
      for (const r of list) {
        scanned++;
        const cat = r.category as { id?: string; name?: string } | null;
        const sub = r.subcategory as { id?: string; name?: string } | null;
        const item = r.item as { id?: string; name?: string } | null;
        if (cat?.id && cat.name) catMap.set(String(cat.id), cat.name);
        if (sub?.id && sub.name && cat?.id) subMap.set(String(sub.id), { name: sub.name, parent: String(cat.id) });
        // Item's parent is the subcategory when present, else falls back to the
        // category itself (Sampark allows items without a subcategory). Sampark
        // uses "-" as a placeholder for "no item set" — skip those.
        if (item?.id && item.name && item.name.trim() !== '-') {
          const parent = sub?.id ? String(sub.id) : (cat?.id ? String(cat.id) : null);
          if (parent) itemMap.set(String(item.id), { name: item.name, parent });
        }

        // Ticket-volume tally, skipping the "Other"/"Others" catch-all at any
        // of the three levels — a ticket routed there tells us nothing about
        // real category distribution, it's just the parser's default.
        const catIsOther = cat?.name ? isOtherName(cat.name) : false;
        const subIsOther = sub?.name ? isOtherName(sub.name) : false;
        const itemIsOther = item?.name ? isOtherName(item.name) : false;
        if (catIsOther || subIsOther || itemIsOther) {
          excludedOther++;
        } else {
          if (cat?.id) catTicketCount.set(String(cat.id), (catTicketCount.get(String(cat.id)) ?? 0) + 1);
          if (sub?.id) subTicketCount.set(String(sub.id), (subTicketCount.get(String(sub.id)) ?? 0) + 1);
          if (item?.id && item.name && item.name.trim() !== '-') {
            itemTicketCount.set(String(item.id), (itemTicketCount.get(String(item.id)) ?? 0) + 1);
          }
        }

        if (typeof r.subject !== 'string') continue;
        if (cat?.id) addKeywords(`category|${cat.id}`, r.subject);
        if (sub?.id) addKeywords(`subcategory|${sub.id}`, r.subject);
        if (item?.id && item.name && item.name.trim() !== '-') addKeywords(`item|${item.id}`, r.subject);
      }
      if (!(res.list_info?.has_more_rows)) break;
    }

    // ---- TF-IDF: turn raw per-node word counts into a small set of genuinely
    // discriminative keywords. A word that shows up in most nodes ("issue",
    // "showing") is generic — down-weighted. A word concentrated in a few nodes
    // ("saksham", "grn", "zscaler") is a real signal — up-weighted. This is what
    // powers the auto-parse engine (lib/utils/samparkClassifier.ts): it studies
    // every historical ticket's actual wording per category/subcategory/item and
    // re-learns on every sync run, rather than relying on a hand-typed list.
    const totalNodes = kw.size;
    const df = new Map<string, number>(); // word → number of distinct nodes containing it
    for (const bucket of kw.values()) {
      for (const w of bucket.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    }
    const topKeywords = (bucket: Map<string, number>, n = 20): string[] => {
      const scored = [...bucket.entries()].map(([w, tf]) => {
        const idf = Math.log((totalNodes + 1) / ((df.get(w) ?? 1) + 1)) + 1;
        return [w, tf * idf] as const;
      });
      return scored.sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
    };

    const rows = [
      ...[...catMap].map(([id, name]) => ({
        id, name, parent_id: null as string | null, is_subcategory: false, is_item: false, is_active: true,
        keywords: kw.has(`category|${id}`) ? topKeywords(kw.get(`category|${id}`)!) : [],
        ticket_count: catTicketCount.get(id) ?? 0,
      })),
      ...[...subMap].map(([id, v]) => ({
        id, name: v.name, parent_id: v.parent, is_subcategory: true, is_item: false, is_active: true,
        keywords: kw.has(`subcategory|${id}`) ? topKeywords(kw.get(`subcategory|${id}`)!) : [],
        ticket_count: subTicketCount.get(id) ?? 0,
      })),
      ...[...itemMap].map(([id, v]) => ({
        id, name: v.name, parent_id: v.parent, is_subcategory: true, is_item: true, is_active: true,
        keywords: kw.has(`item|${id}`) ? topKeywords(kw.get(`item|${id}`)!) : [],
        ticket_count: itemTicketCount.get(id) ?? 0,
      })),
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
      items: itemMap.size,
      excludedOther,
      analyzedTickets: scanned - excludedOther,
    };
    if (analyze) {
      // Real ticket-volume distribution (not keyword frequency) — "Other"/
      // "Others" tickets already excluded above. Sorted descending so the
      // response reads as a ranked breakdown.
      result.categoryCounts = Object.fromEntries(
        [...catTicketCount.entries()]
          .map(([id, count]) => [catMap.get(id) ?? id, count] as const)
          .sort((a, b) => b[1] - a[1]),
      );
      result.subcategoryCounts = Object.fromEntries(
        [...subTicketCount.entries()]
          .map(([id, count]) => {
            const sub = subMap.get(id);
            const label = sub ? `${catMap.get(sub.parent) ?? '?'} › ${sub.name}` : id;
            return [label, count] as const;
          })
          .sort((a, b) => b[1] - a[1]),
      );
    }
    if (qp.get('keywords') === '1') {
      // Human-readable: resolve "level|id" → "level|Name" and show the actual
      // TF-IDF keywords now stored on the row, so this doubles as a way to spot-
      // check what the classifier learned. Separate flag from `analyze` since
      // this dump is large (one entry per taxonomy node) and usually not
      // needed alongside the ticket-count breakdown.
      const nameOf = (level: string, id: string) =>
        level === 'category' ? catMap.get(id) : level === 'subcategory' ? subMap.get(id)?.name : itemMap.get(id)?.name;
      result.keywords = Object.fromEntries(
        [...kw].map(([key, bucket]) => {
          const [level, id] = key.split('|');
          return [`${level}|${nameOf(level, id) ?? id}`, topKeywords(bucket, 15)];
        }),
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
