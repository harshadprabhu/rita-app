import React from 'react';
import { FlatList, RefreshControl, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { ProfileIconButton } from '../common/ProfileIconButton';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { TicketCard } from './TicketCard';
import { getTickets } from '../../lib/api/tickets';
import { useAuthStore } from '../../stores/authStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { theme } from '../../constants/theme';

interface Props {
  title: string;
  filters: Parameters<typeof getTickets>[0];
  showCreateButton?: boolean;
}

export function TicketListScreen({ title, filters, showCreateButton }: Props) {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const { data: tickets, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QUERY_KEYS.tickets(filters),
    queryFn: () => getTickets(filters),
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={title}
        right={
          <View style={styles.headerRight}>
            {showCreateButton && (
              <TouchableOpacity onPress={() => router.push('/create-ticket')} style={styles.addBtn}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            {profile && <ProfileIconButton profile={profile} />}
          </View>
        }
      />
      {isLoading ? (
        <LoadingOverlay />
      ) : (
        <FlatList
          data={tickets ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TicketCard ticket={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState icon="ticket-outline" title={t('ticketList.empty')} subtitle={t('ticketList.emptySubtitle')} />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: theme.spacing.md, flexGrow: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  addBtn: { marginRight: theme.spacing.md },
});
