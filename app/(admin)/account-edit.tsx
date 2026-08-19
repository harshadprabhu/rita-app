import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { StoreSearchPicker } from '../../components/admin/StoreSearchPicker';
import { getProfile, updateProfile } from '../../lib/api/profiles';
import { useUiStore } from '../../stores/uiStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { ROLE_LABELS } from '../../constants/roles';
import { extractErrorMessage } from '../../lib/utils/error';
import { UserRole, DbStore } from '../../types';
import { supabase } from '../../lib/supabase';
import { theme, webNoOutline } from '../../constants/theme';

const ASSIGNABLE_ROLES: UserRole[] = ['user', 'in_store_manager', 'technician', 'manager', 'ops_manager', 'admin'];

export default function AccountEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUiStore((s) => s.showToast);
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['admin-profile-edit', id],
    queryFn: () => getProfile(id!),
    enabled: !!id,
  });

  const { data: stores } = useQuery({
    queryKey: QUERY_KEYS.stores(),
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as DbStore[];
    },
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeLocation, setStoreLocation] = useState<string | null>(null);
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (profile && !init) {
      setFirstName(profile.first_name);
      setLastName(profile.last_name);
      setPhone(profile.phone ?? '');
      setDesignation(profile.designation ?? '');
      setRole(profile.role);
      setStoreId(profile.store_id ?? undefined);
      setStoreName(profile.store_name);
      setStoreLocation(profile.store_location);
      setInit(true);
    }
  }, [profile, init]);

  const save = useMutation({
    mutationFn: () => updateProfile(id!, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      designation: designation.trim() || null,
      role,
      store_id: storeId ?? null,
      store_name: storeName,
      store_location: storeLocation,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.accounts() });
      qc.invalidateQueries({ queryKey: ['admin-profile-edit', id] });
      showToast('Profile updated', 'success');
      router.back();
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  const handleStoreSelect = (selectedId: string | undefined) => {
    setStoreId(selectedId);
    if (selectedId && stores) {
      const s = stores.find((st) => st.id === selectedId);
      if (s) {
        setStoreName(s.name);
        setStoreLocation(s.city);
      }
    } else {
      setStoreName(null);
      setStoreLocation(null);
    }
  };

  if (isLoading || !profile) return <Screen edges={['top']}><AppHeader title="Edit Account" showBack /><LoadingOverlay /></Screen>;

  const valid = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Edit Account" showBack />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{firstName[0]?.toUpperCase() ?? '?'}{lastName[0]?.toUpperCase() ?? ''}</Text>
          </View>
          <View>
            <Text style={s.displayName}>{profile.display_name}</Text>
            <Text style={s.email}>{profile.id.slice(0, 8)}…</Text>
          </View>
        </View>

        <Text style={s.label}>First Name *</Text>
        <TextInput style={[s.input, webNoOutline]} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={theme.colors.textTertiary} />

        <Text style={s.label}>Last Name *</Text>
        <TextInput style={[s.input, webNoOutline]} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={theme.colors.textTertiary} />

        <Text style={s.label}>Phone</Text>
        <TextInput style={[s.input, webNoOutline]} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={theme.colors.textTertiary} keyboardType="phone-pad" />

        <Text style={s.label}>Designation</Text>
        <TextInput style={[s.input, webNoOutline]} value={designation} onChangeText={setDesignation} placeholder="e.g. Store Manager" placeholderTextColor={theme.colors.textTertiary} />

        <Text style={s.label}>Role</Text>
        <View style={s.roleRow}>
          {ASSIGNABLE_ROLES.map((r) => (
            <TouchableOpacity key={r} style={[s.rolePill, role === r && s.rolePillActive]} onPress={() => setRole(r)} activeOpacity={0.7}>
              <Text style={[s.rolePillText, role === r && s.rolePillTextActive]}>{ROLE_LABELS[r]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Store</Text>
        {stores && (
          <StoreSearchPicker
            stores={stores}
            selectedId={storeId}
            onSelect={handleStoreSelect}
            label={storeName ? `${storeName}${storeLocation ? ` (${storeLocation})` : ''}` : 'Select store'}
          />
        )}

        <TouchableOpacity style={[s.saveBtn, !valid && s.saveBtnDisabled]} onPress={() => save.mutate()} disabled={!valid || save.isPending} activeOpacity={0.7}>
          {save.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { padding: theme.spacing.lg },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: theme.spacing.xl },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.brand, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  displayName: { fontSize: 18, fontWeight: '800', color: theme.colors.textPrimary },
  email: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginTop: theme.spacing.md, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
    backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: theme.colors.textPrimary,
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rolePill: {
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.full,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  rolePillActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.accentLight },
  rolePillText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  rolePillTextActive: { color: theme.colors.brand },
  saveBtn: {
    backgroundColor: theme.colors.brand, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center' as const, marginTop: theme.spacing.xl,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
