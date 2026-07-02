import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Auto-assigns a newly created, unassigned ticket to the approved technician
// with the fewest currently open tickets (optionally filtered by department).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: 'ticket_id required' }), { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: ticket } = await supabase.from('tickets').select('id, assignee_id, department_id').eq('id', ticket_id).single();
    if (!ticket || ticket.assignee_id) {
      return new Response(JSON.stringify({ skipped: true }), { headers: CORS });
    }

    let techQuery = supabase
      .from('profiles')
      .select('id')
      .eq('role', 'technician')
      .eq('approval_status', 'approved')
      .eq('is_active', true);
    const { data: technicians } = await techQuery;
    if (!technicians?.length) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no technicians' }), { headers: CORS });
    }

    const { data: openCounts } = await supabase
      .from('tickets')
      .select('assignee_id')
      .in('status', ['open', 'in_progress'])
      .in('assignee_id', technicians.map((t) => t.id));

    const counts = new Map<string, number>(technicians.map((t) => [t.id, 0]));
    for (const row of openCounts ?? []) {
      if (row.assignee_id) counts.set(row.assignee_id, (counts.get(row.assignee_id) ?? 0) + 1);
    }

    const [leastBusy] = [...counts.entries()].sort((a, b) => a[1] - b[1]);
    const assigneeId = leastBusy[0];

    await supabase
      .from('tickets')
      .update({ assignee_id: assigneeId, lifecycle: 'being_worked_on' })
      .eq('id', ticket_id);

    await supabase.from('ticket_audit_log').insert({
      ticket_id,
      actor_id: null,
      action: 'auto_dispatched',
      from_value: 'unassigned',
      to_value: assigneeId,
    });

    return new Response(JSON.stringify({ assignee_id: assigneeId }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
