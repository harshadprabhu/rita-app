import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: overdue, error } = await supabase
    .from('tickets')
    .select('id, ticket_number, assignee_id, requester_id, store_id')
    .lt('sla_due_at', new Date().toISOString())
    .eq('sla_breached', false)
    .not('status', 'eq', 'resolved');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  }
  if (!overdue?.length) {
    return new Response(JSON.stringify({ breached: 0 }), { headers: CORS });
  }

  const ids = overdue.map((t) => t.id);
  await supabase.from('tickets').update({ sla_breached: true }).in('id', ids);

  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');

  const notifRows = overdue.flatMap((t) => {
    const recipients = new Set<string>(admins?.map((a) => a.id) ?? []);
    if (t.assignee_id) recipients.add(t.assignee_id);
    return Array.from(recipients).map((recipient_id) => ({
      recipient_id,
      ticket_id: t.id,
      title: 'SLA Breach',
      body: `Ticket ${t.ticket_number} has breached its SLA.`,
      type: 'sla_breach',
    }));
  });

  if (notifRows.length) {
    await supabase.from('notifications').insert(notifRows);
  }

  return new Response(JSON.stringify({ breached: overdue.length }), { headers: CORS });
});
