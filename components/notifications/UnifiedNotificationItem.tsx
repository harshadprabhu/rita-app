import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, TouchableWithoutFeedback, BackHandler, StyleSheet as RNStyleSheet,
} from 'react-native';
import { Portal } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedItem } from '../../hooks/useUnifiedNotifications';
import { NotificationType } from '../../types';
import { timeAgo, formatDateTime } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

interface Props {
  item: FeedItem;
  onMarkRead?: (notificationId: string) => void;
}

// ─── A) Announcement card ────────────────────────────────────────────────────

function AnnouncementModal({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 250,
      useNativeDriver: true,
    }).start(onClose);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <Portal>
      <View style={RNStyleSheet.absoluteFill}>
        <TouchableWithoutFeedback onPress={dismiss}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            styles.modalSheet,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.xxl), transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="megaphone" size={18} color="rgba(201,168,76,0.9)" />
            </View>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>{item.title}</Text>
              <Text style={styles.modalDate}>{formatDateTime(item.created_at)}</Text>
            </View>
            <TouchableOpacity onPress={dismiss} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalDivider} />
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalBody}>{item.body}</Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Portal>
  );
}

function AnnouncementCard({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.75}>
        <View style={styles.announceCard}>
          <View style={styles.baseRow}>
            <View style={styles.announceIconBox}>
              <Ionicons name="megaphone" size={20} color="rgba(201,168,76,0.9)" />
            </View>
            <View style={styles.content}>
              <Text style={styles.announceTitle} numberOfLines={2}>{item.title}</Text>
              {item.body ? (
                <Text style={styles.announceBody} numberOfLines={2}>{item.body}</Text>
              ) : null}
              <Text style={styles.announceTime}>{timeAgo(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" style={styles.announceChevron} />
          </View>
        </View>
      </TouchableOpacity>
      {open && <AnnouncementModal item={item} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── B) Gold rate card ───────────────────────────────────────────────────────

// Body produced by the sync-gold-rate edge function: lines joined by "\n", up to
// two "label: ₹value" entries per line separated by " | ". Parse it back into
// individual rate entries so each can be shown in its own box.
function parseGoldRates(body: string | null): { label: string; value: string }[] {
  if (!body) return [];
  return body
    .split('\n')
    .flatMap((line) => line.split('|'))
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const i = seg.indexOf(':');
      return i === -1
        ? null
        : { label: seg.slice(0, i).trim(), value: seg.slice(i + 1).trim() };
    })
    .filter((e): e is { label: string; value: string } => !!e && !!e.label && !!e.value);
}

function GoldRateNotifCard({ item }: { item: FeedItem }) {
  const rates = parseGoldRates(item.body);

  return (
    <View style={styles.goldCard}>
      <View style={styles.baseRow}>
        <View style={styles.goldIconBox}>
          <Ionicons name="trending-up" size={20} color="#C9A84C" />
        </View>
        <View style={styles.content}>
          <Text style={styles.goldTitle} numberOfLines={1}>{item.title}</Text>

          {rates.length > 0 ? (
            <View style={styles.goldGrid}>
              {rates.map((r) => (
                <View key={r.label} style={styles.goldRateTile}>
                  <Text style={styles.goldRateLabel}>{r.label}</Text>
                  <Text style={styles.goldRateValue}>{r.value}</Text>
                </View>
              ))}
            </View>
          ) : item.body ? (
            <Text style={styles.goldBody}>{item.body}</Text>
          ) : null}

          <Text style={styles.goldTime}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── C) Ticket card ──────────────────────────────────────────────────────────

type TicketIconCfg = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

function getTicketIconCfg(type?: NotificationType | null): TicketIconCfg {
  switch (type) {
    case 'ticket_assigned':
      return { icon: 'person-circle', color: '#7C3AED', bg: '#F5F3FF' };
    case 'ticket_resolved':
      return { icon: 'checkmark-circle', color: '#059669', bg: '#ECFDF5' };
    case 'ticket_created':
      return { icon: 'add-circle', color: '#2563EB', bg: '#EFF6FF' };
    case 'ticket_updated':
      return { icon: 'refresh-circle', color: '#2563EB', bg: '#EFF6FF' };
    case 'ticket_comment':
      return { icon: 'chatbubble-ellipses', color: '#2563EB', bg: '#EFF6FF' };
    case 'sla_breach':
      return { icon: 'alert-circle', color: '#DC2626', bg: '#FEF2F2' };
    default:
      return { icon: 'notifications', color: '#2563EB', bg: '#EFF6FF' };
  }
}

function TicketCard({ item, onMarkRead }: { item: FeedItem; onMarkRead?: (id: string) => void }) {
  const isUnread = !item.is_read;
  const { icon, color, bg } = getTicketIconCfg(item.notificationType);

  const handlePress = () => {
    if (!item.is_read && item.notificationId && onMarkRead) {
      onMarkRead(item.notificationId);
    }
    if (item.ticket_id) {
      router.push(`/tickets/${item.ticket_id}`);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.ticketCard, isUnread ? styles.ticketUnread : styles.ticketRead]}
      onPress={handlePress}
      activeOpacity={item.ticket_id ? 0.7 : 1}
    >
      <View style={styles.baseRow}>
        <View style={[styles.iconBox, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={styles.content}>
          <Text style={styles.ticketTitle} numberOfLines={2}>{item.title}</Text>
          {item.body ? (
            <Text style={styles.ticketBody} numberOfLines={2}>{item.body}</Text>
          ) : null}
          <Text style={styles.ticketTime}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
      {isUnread && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function UnifiedNotificationItem({ item, onMarkRead }: Props) {
  if (item.kind === 'announcement') return <AnnouncementCard item={item} />;
  if (item.kind === 'gold_rate') return <GoldRateNotifCard item={item} />;
  return <TicketCard item={item} onMarkRead={onMarkRead} />;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const ICON_SIZE = 38;

const styles = StyleSheet.create({
  // Shared layout
  baseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  content: {
    flex: 1,
    gap: theme.spacing.xs - 1,
  },
  iconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── A) Announcement ───────────────────────────────────────────────────────
  announceCard: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    ...theme.shadows.md,
  },
  announceIconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  announceTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  announceBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  announceTime: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: theme.spacing.xs,
  },
  announceChevron: {
    alignSelf: 'center',
    flexShrink: 0,
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalBackdrop: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
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

  // ── B) Gold rate ──────────────────────────────────────────────────────────
  goldCard: {
    backgroundColor: '#2A1E00',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  goldIconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  goldTitle: {
    color: '#C9A84C',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: theme.spacing.sm,
  },
  goldBody: {
    color: 'rgba(201,168,76,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  goldTime: {
    color: 'rgba(201,168,76,0.3)',
    fontSize: 11,
    marginTop: theme.spacing.sm,
  },
  goldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goldRateTile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  goldRateLabel: {
    color: 'rgba(201,168,76,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  goldRateValue: {
    color: '#F0E2B8',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── C) Ticket ─────────────────────────────────────────────────────────────
  ticketCard: {
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  ticketUnread: {
    backgroundColor: '#F0F5FF',
    borderWidth: 1,
    borderColor: '#C7D9F5',
    ...theme.shadows.sm,
  },
  ticketRead: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  ticketTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  ticketBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  ticketTime: {
    color: theme.colors.textTertiary,
    fontSize: 11,
    marginTop: theme.spacing.xs,
  },
  unreadDot: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: '#2563EB',
  },
});
