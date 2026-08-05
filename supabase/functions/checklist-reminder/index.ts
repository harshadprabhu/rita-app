import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Daily "you haven't submitted yet" reminder for the Saksham checklists.
// Runs on a cron (checklists-reminder-cron.sql) — for every active
// in_store_manager with a store, and every active template, inserts a
// checklist_reminder notification if today's submission isn't 'submitted'
// yet. Rides the existing notification_push trigger for the OS push, same
// as every other notification insert in this codebase.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const today = todayIST();

    const [{ data: templates, error: tErr }, { data: managers, error: mErr }] = await Promise.all([
      supabase.from('checklist_templates').select('id, name').eq('is_active', true),
      supabase.from('profiles').select('id, store_id, display_name')
        .eq('role', 'in_store_manager').eq('is_active', true).eq('approval_status', 'approved')
        .not('store_id', 'is', null),
    ]);
    if (tErr) throw tErr;
    if (mErr) throw mErr;
    if (!templates?.length || !managers?.length) {
      return new Response(JSON.stringify({ ok: true, reminders: 0, note: 'no templates or managers' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: submitted, error: sErr } = await supabase
      .from('checklist_submissions')
      .select('template_id, store_id')
      .eq('submission_date', today)
      .eq('status', 'submitted');
    if (sErr) throw sErr;

    const submittedSet = new Set((submitted ?? []).map((s) => `${s.template_id}|${s.store_id}`));

    const toInsert: { recipient_id: string; title: string; body: string; type: string }[] = [];
    for (const mgr of managers as { id: string; store_id: string; display_name: string }[]) {
      const missing = (templates as { id: string; name: string }[]).filter(
        (t) => !submittedSet.has(`${t.id}|${mgr.store_id}`),
      );
      if (!missing.length) continue;
      toInsert.push({
        recipient_id: mgr.id,
        title: 'Checklist reminder',
        body: missing.length === 1
          ? `${missing[0].name} not submitted yet today`
          : `${missing.length} checklists not submitted yet today`,
        type: 'checklist_reminder',
      });
    }

    if (toInsert.length) {
      const { error: insErr } = await supabase.from('notifications').insert(toInsert);
      if (insErr) throw insErr;
    }

    return new Response(JSON.stringify({ ok: true, reminders: toInsert.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[checklist-reminder]', err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
