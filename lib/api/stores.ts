import { supabase } from '../supabase';
import { DbStore } from '../../types';

export async function getStores(): Promise<DbStore[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as DbStore[];
}

export async function getStoreByCode(code: string): Promise<DbStore | null> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    // PGRST116 = no rows, 42501 = RLS permission denied
    if (error.code === '42501') {
      console.warn(
        '[stores] Permission denied -- run this SQL in Supabase to fix:\n' +
        'DROP POLICY stores_read ON stores;\n' +
        "CREATE POLICY stores_read ON stores FOR SELECT USING (true);",
      );
    }
    return null;
  }
  return data as DbStore | null;
}
