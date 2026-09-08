import { supabase } from '../supabase';

// A technician as shown on Connect, normalized from the Sampark roster.
export interface ConnectTechnician {
  ritaProfileId: string;   // for the in-app DM
  name: string;
  online: boolean;         // Sampark's own availability signal
}

// Licensed Sampark technicians who also have a RITA account (rita_profile_id
// set by the sync). Only these are chattable in-app, so only these are shown.
// Returns [] until the roster is synced (Zoho users scope pending), which lets
// Connect fall back to its RITA-profile list.
export async function getSamparkConnectTechnicians(): Promise<ConnectTechnician[]> {
  const { data, error } = await supabase
    .from('sampark_technicians')
    .select('rita_profile_id, name, online')
    .not('rita_profile_id', 'is', null)
    .order('online', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ritaProfileId: r.rita_profile_id as string, name: r.name as string, online: !!r.online }));
}
