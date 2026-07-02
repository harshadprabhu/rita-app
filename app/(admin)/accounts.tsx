import React from 'react';
import { View, Text, FlatList, StyleSheet, Switch, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { EmptyState } from '../../components/common/EmptyState';
import { getAccounts, setAccountActive } from '../../lib/api/profiles';
import { useAuthStore } from '../../stores/authStore';
import { ROLE_LABELS } from '../../constants/roles';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

export default function Accounts() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const { data: accounts, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QUERY_KEYS.accounts(),
    queryFn: () => getAccounts(),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setAccountActive(id, isActive, profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts() }),
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
                <Text style={styles.meta}>{ROLE_LABELS[item.role]} · {item.store_name ?? item.store_id ?? '-'}</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  rowText: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
});
