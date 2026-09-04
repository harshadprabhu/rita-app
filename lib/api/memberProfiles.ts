import { supabase } from '../supabase';

export interface MemberProfile {
  id: string;
  account_id: string;
  name: string;
  phone: string | null;
  avatar_color: string | null;
  avatar_emoji: string | null;
  created_at: string;
}

export async function getMemberProfiles(accountId: string): Promise<MemberProfile[]> {
  const { data, error } = await supabase
    .from('member_profiles')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemberProfile[];
}

export async function createMemberProfile(input: {
  accountId: string;
  name: string;
  phone: string;
  avatarColor: string;
  avatarEmoji?: string | null;
}): Promise<MemberProfile> {
  const { data, error } = await supabase
    .from('member_profiles')
    .insert({
      account_id: input.accountId,
      name: input.name.trim(),
      phone: input.phone,
      avatar_color: input.avatarColor,
      avatar_emoji: input.avatarEmoji ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MemberProfile;
}

export async function deleteMemberProfile(id: string): Promise<void> {
  const { error } = await supabase.from('member_profiles').delete().eq('id', id);
  if (error) throw error;
}
