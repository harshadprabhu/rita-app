import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Switch, RefreshControl, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { EmptyState } from '../../components/common/EmptyState';
import { getAccounts, setAccountActive, setAccountRole } from '../../lib/api/profiles';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { ROLE_LABELS } from '../../constants/roles';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { extractErrorMessage } from '../../lib/utils/error';
import { UserRole, DbProfile } from '../../types';
import { theme } from '../../constants/theme';

const ASSIGNABLE_ROLES: UserRole[] = ['user', 'technician', 'manager', 'admin'];

export default function Accounts() {
  const profile = useAuthStore((s) => s.profile);
  const showToast = useUiStore((s) => s.showToast);
  const queryClient = useQueryClient();
  const [roleTarget, setRoleTarget] = useState<DbProfile | null>(null);

  const { data: accounts, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QUERY_KEYS.accounts(),
    queryFn: () => getAccounts(),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setAccountActive(id, isActive, profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts() }),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => setAccountRole(id, role, profile!.id),
    onSuccess: (_d, { role }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts() });
      setRoleTarget(null);
      showToast(`Role updated to ${ROLE_LABELS[role]}`, 'success');
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Accounts" showBack />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={accounts ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => (
            <View style={[styles.row, theme.shadows.sm]}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.display_name}</Text>
                <Text style={styles.meta}>{item.store_name ?? item.store_id ?? 'No store'}</Text>
                {/* Tap the role chip to reassign */}
                <TouchableOpacity
                  style={styles.roleChip}
                  onPress={() => setRoleTarget(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.roleChipText}>{ROLE_LABELS[item.role]}</Text>
                  <Ionicons name="chevron-down" size={13} color={theme.colors.brand} />
                </TouchableOpacity>
              </View>
              <Switch
                value={item.is_active}
                onValueChange={(v) => toggleActive.mutate({ id: item.id, isActive: v })}
                trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              />
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="people-outline" title="No accounts yet" />}
        />
      )}

      {/* Role picker */}
      <Modal
        visible={!!roleTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleTarget(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRoleTarget(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Assign role</Text>
            <Text style={styles.sheetSubtitle}>{roleTarget?.display_name}</Text>
            {ASSIGNABLE_ROLES.map((role) => {
              const current = roleTarget?.role === role;
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleOption, current && styles.roleOptionCurrent]}
                  onPress={() => !current && roleTarget && changeRole.mutate({ id: roleTarget.id, role })}
                  disabled={changeRole.isPending}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.roleOptionText, current && styles.roleOptionTextCurrent]}>
                    {ROLE_LABELS[role]}
                  </Text>
                  {current && <Ionicons name="checkmark" size={18} color={theme.colors.brand} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  rowText: { flex: 1, gap: 4 },
  name: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  meta: { fontSize: 12, color: theme.colors.textSecondary },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentLight, borderRadius: theme.radius.full,
    paddingVertical: 3, paddingHorizontal: theme.spacing.sm, marginTop: 2,
  },
  roleChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.brand },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.xs,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
  sheetSubtitle: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
  roleOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.border,
  },
  roleOptionCurrent: { borderColor: theme.colors.brand, backgroundColor: theme.colors.accentLight },
  roleOptionText: { fontSize: 15, fontWeight: '600', color: theme.colors.textPrimary },
  roleOptionTextCurrent: { color: theme.colors.brand },
});
