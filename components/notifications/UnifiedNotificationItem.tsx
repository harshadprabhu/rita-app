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

// ─── B) Ticket card ──────────────────────────────────────────────────────────

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

  // ── B) Ticket ─────────────────────────────────────────────────────────────
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
