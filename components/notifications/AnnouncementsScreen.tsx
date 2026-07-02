import React, { useState } from 'react';
import {
  FlatList, StyleSheet, View, RefreshControl,
  TouchableOpacity, Modal, ScrollView,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { getBroadcasts } from '../../lib/api/broadcasts';
import { formatDateTime } from '../../lib/utils/date';
import { DbBroadcast } from '../../types';
import { theme } from '../../constants/theme';

function isTargeted(item: DbBroadcast): boolean {
  return !!item.target_store_id || !!(item.target_store_ids && item.target_store_ids.length > 0);
}

function AnnouncementCard({ item, onPress }: { item: DbBroadcast; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.iconWrap}>
            <Ionicons name="megaphone" size={20} color={theme.colors.accent} />
          </View>
          <View style={styles.textBlock}>
            <Text variant="labelLarge" style={styles.title}>{item.title}</Text>
            <Text variant="bodySmall" style={styles.body} numberOfLines={2}>{item.body}</Text>
            <Text variant="labelSmall" style={styles.date}>
              {formatDateTime(item.created_at)}
              {isTargeted(item) ? ` · ${t('announcements.yourStore')}` : ` · ${t('announcements.allStores')}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} style={styles.chevron} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function AnnouncementModal({
  item,
  onClose,
}: {
  item: DbBroadcast;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.xxl) }]}>
          {/* Fixed header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="megaphone" size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>{item.title}</Text>
              <Text style={styles.modalDate}>
                {formatDateTime(item.created_at)}
                {isTargeted(item) ? ` · ${t('announcements.yourStore')}` : ` · ${t('announcements.allStores')}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalDivider} />

          {/* Scrollable body */}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalBody}>{item.body}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function AnnouncementsScreen() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<DbBroadcast | null>(null);

  const {
    data: broadcasts,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: QUERY_KEYS.broadcasts(),
    queryFn: getBroadcasts,
    staleTime: 60 * 1000,
  });

  if (isLoading) return <LoadingOverlay />;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('announcements.title')} showBack />
      <FlatList
        data={broadcasts ?? []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <AnnouncementCard item={item} onPress={() => setSelected(item)} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="megaphone-outline"
            title={t('announcements.emptyTitle')}
            subtitle={t('announcements.emptySubtitle')}
          />
        }
      />

      {selected && (
        <AnnouncementModal item={selected} onClose={() => setSelected(null)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: theme.spacing.sm,
    paddingBottom: theme.spacing.lg * 2,
    paddingHorizontal: theme.spacing.lg,
  },

  // ── List card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: theme.statusColors.in_progress.bg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardContent: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  body: {
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  date: {
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs - 2,
  },
  chevron: {
    flexShrink: 0,
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.statusColors.in_progress.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
    flexShrink: 0,
  },
  modalHeaderText: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  modalDate: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modalDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.lg,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  modalBody: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
});
