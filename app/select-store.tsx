import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/common/Screen';
import { StoreSearchPicker } from '../components/admin/StoreSearchPicker';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { signOut } from '../lib/auth/session';
import { supabase } from '../lib/supabase';
import { extractErrorMessage } from '../lib/utils/error';
import { QUERY_KEYS } from '../constants/queryKeys';
import { DbStore } from '../types';
import { theme } from '../constants/theme';

export default function SelectStore() {
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const showToast = useUiStore((s) => s.showToast);

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeLocation, setStoreLocation] = useState<string | null>(null);

  const { data: stores, isLoading } = useQuery({
    queryKey: QUERY_KEYS.stores(),
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as DbStore[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!profile || !selectedId) throw new Error('Select a store');
      const { error } = await supabase
        .from('profiles')
        .update({ store_id: selectedId, store_name: storeName, store_location: storeLocation })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (profile) {
        setProfile({ ...profile, store_id: selectedId!, store_name: storeName, store_location: storeLocation });
      }
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  const handleSelect = (id: string | undefined) => {
    setSelectedId(id);
    if (id && stores) {
      const s = stores.find((st) => st.id === id);
      if (s) {
        setStoreName(s.name);
        setStoreLocation(s.city);
      }
    } else {
      setStoreName(null);
      setStoreLocation(null);
    }
  };

  if (isLoading) return <Screen><LoadingOverlay /></Screen>;

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="storefront-outline" size={48} color={theme.colors.brand} />
        </View>
        <Text style={styles.title}>Select Your Store</Text>
        <Text style={styles.body}>
          We couldn't determine your store automatically. Please select the store or location you're associated with.
        </Text>

        <View style={styles.pickerWrap}>
          {stores && (
            <StoreSearchPicker
              stores={stores}
              selectedId={selectedId}
              onSelect={handleSelect}
              label={storeName ? `${storeName}${storeLocation ? ` (${storeLocation})` : ''}` : 'Search and select your store'}
            />
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, !selectedId && styles.saveBtnDisabled]}
          onPress={() => save.mutate()}
          disabled={!selectedId || save.isPending}
          activeOpacity={0.7}
        >
          {save.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={signOut} style={styles.signOutBtn} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: theme.spacing.lg * 2, gap: theme.spacing.md },
  iconWrap: {
    width: 80, height: 80, borderRadius: 20, backgroundColor: theme.colors.accentLight,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: theme.spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, textAlign: 'center' },
  body: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  pickerWrap: { marginTop: theme.spacing.md },
  saveBtn: {
    backgroundColor: theme.colors.brand, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center' as const, marginTop: theme.spacing.md,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  signOutBtn: { alignSelf: 'center', paddingVertical: theme.spacing.sm },
  signOutText: { color: theme.colors.error, fontSize: 14, fontWeight: '600' },
});
