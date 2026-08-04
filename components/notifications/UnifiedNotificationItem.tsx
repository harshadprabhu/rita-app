import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, TouchableWithoutFeedback, BackHandler, StyleSheet as RNStyleSheet,
} from 'react-native';
import { Portal } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SoftPress } from '../common/SoftPress';
import { FeedItem } from '../../hooks/useUnifiedNotifications';
import { NotificationType } from '../../types';
import { timeAgo, formatDateTime } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

interface Props {
  item: FeedItem;
  onMarkRead?: (notificationId: string) => void;
  onReadAnnouncement?: (broadcastId: string) => void;
}

// ─── Shared popup modal ─────────────────────────────────────────────────────

function DetailModal({
  item,
  icon,
  iconColor,
  iconBg,
  onClose,
}: {
  item: FeedItem;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  onClose: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
    ]).start(onClose);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, []);

  const handleViewTicket = () => {
    dismiss();
    setTimeout(() => {
      if (item.ticket_id) router.push(`/tickets/${item.ticket_id}`);
    }, 180);
  };

  return (
    <Portal>
      <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={dismiss}>
          <Animated.View style={[styles.modalBackdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            styles.modalPopup,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconWrap, { backgroundColor: iconBg }]}>
              <Ionicons name={icon} size={18} color={iconColor} />
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
            {item.body ? (
              <Text style={styles.modalBody}>{item.body}</Text>
            ) : (
              <Text style={styles.modalBodyEmpty}>No additional details</Text>
            )}
          </ScrollView>
          {item.ticket_id ? (
            <>
              <View style={styles.modalDivider} />
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.viewTicketBtn} onPress={handleViewTicket} activeOpacity={0.7}>
                  <Ionicons name="open-outline" size={15} color="#fff" />
                  <Text style={styles.viewTicketText}>View Ticket</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </Animated.View>
      </View>
    </Portal>
  );
}

// ─── A) Announcement card ───────────────────────────────────────────────────

function AnnouncementCard({
  item, onReadAnnouncement, onMarkRead,
}: {
  item: FeedItem;
  onReadAnnouncement?: (broadcastId: string) => void;
  onMarkRead?: (notificationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isUnread = !item.is_read;

  const handleOpen = () => {
    if (isUnread) {
      if (item.broadcastId && onReadAnnouncement) onReadAnnouncement(item.broadcastId);
      else if (item.notificationId && onMarkRead) onMarkRead(item.notificationId);
    }
    setOpen(true);
  };

  return (
    <>
      <SoftPress onPress={handleOpen} scaleTo={0.97}>
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
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} style={styles.chevron} />
          </View>
          {isUnread && <View style={styles.announceUnreadDot} />}
        </View>
      </SoftPress>
      {open && (
        <DetailModal
          item={item}
          icon="megaphone"
          iconColor="rgba(201,168,76,0.9)"
          iconBg="rgba(201,168,76,0.15)"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── B) Ticket / alert card ─────────────────────────────────────────────────

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
  const [open, setOpen] = useState(false);
  const isUnread = !item.is_read;
  const { icon, color, bg } = getTicketIconCfg(item.notificationType);

  const handlePress = () => {
    if (!item.is_read && item.notificationId && onMarkRead) {
      onMarkRead(item.notificationId);
    }
    setOpen(true);
  };

  return (
    <>
      <SoftPress
        style={[styles.ticketCard, isUnread ? styles.ticketUnread : styles.ticketRead]}
        onPress={handlePress}
        scaleTo={0.97}
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
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} style={styles.chevron} />
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </SoftPress>
      {open && (
        <DetailModal
          item={item}
          icon={icon}
          iconColor={color}
          iconBg={bg}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Main export ────────────────────────────────────────────────────────────

export function UnifiedNotificationItem({ item, onMarkRead, onReadAnnouncement }: Props) {
  if (item.kind === 'announcement') {
    return <AnnouncementCard item={item} onReadAnnouncement={onReadAnnouncement} onMarkRead={onMarkRead} />;
  }
  return <TicketCard item={item} onMarkRead={onMarkRead} />;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  chevron: {
    alignSelf: 'center',
    flexShrink: 0,
  },

  // ── A) Announcement ───────────────────────────────────────────────────────
  announceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  announceIconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(201,168,76,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  announceTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  announceBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  announceTime: {
    color: theme.colors.textTertiary,
    fontSize: 11,
    marginTop: theme.spacing.xs,
  },
  announceUnreadDot: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },

  // ── Popup modal ──────────────────────────────────────────────────────────
  modalOverlay: {
    ...RNStyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  modalBackdrop: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalPopup: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 480,
    ...theme.shadows.lg,
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
  modalBodyEmpty: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  modalFooter: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  viewTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  viewTicketText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
