import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DbNotification } from '../../types';
import { timeAgo } from '../../lib/utils/date';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';

interface Props {
  notification: DbNotification;
  onRead: (id: string) => void;
}

const isBroadcast = (n: DbNotification) => n.type === 'broadcast';

export function NotificationItem({ notification, onRead }: Props) {
  const handlePress = () => {
    if (!notification.is_read) onRead(notification.id);
    if (notification.ticket_id) {
      router.push(`/tickets/${notification.ticket_id}`);
    }
  };

  const broadcast = isBroadcast(notification);
  const isUnread = !notification.is_read && !broadcast;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={notification.ticket_id ? 0.7 : 1}
      style={[
        styles.card,
        isUnread ? styles.cardUnread : styles.cardRead,
        broadcast && styles.cardBroadcast,
      ]}
    >
      <View style={[styles.iconBox, broadcast ? styles.iconBoxBroadcast : styles.iconBoxTicket]}>
        <Ionicons
          name={broadcast ? 'megaphone' : 'notifications'}
          size={20}
          color={broadcast ? '#C9A84C' : theme.colors.brand}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, broadcast && styles.titleBroadcast]}>
          {notification.title}
        </Text>
        {notification.body ? (
          <Text style={[styles.body, broadcast && styles.bodyBroadcast]} numberOfLines={2}>
            {notification.body}
          </Text>
        ) : null}
        <Text style={[styles.time, broadcast && styles.timeBroadcast]}>
          {timeAgo(notification.created_at)}
        </Text>
      </View>

      {isUnread && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardRead: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  // Unread: gold left rail on a white card (mockup treatment).
  cardUnread: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
  },
  cardBroadcast: {
    backgroundColor: '#1E3A5F',
    borderColor: 'rgba(255,255,255,0.08)',
  },

  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxTicket: {
    backgroundColor: '#EFF6FF',
  },
  iconBoxBroadcast: {
    backgroundColor: 'rgba(201,168,76,0.12)',
  },

  content: {
    flex: 1,
    gap: theme.spacing.xs - 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  titleBroadcast: {
    color: '#fff',
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  bodyBroadcast: {
    color: 'rgba(255,255,255,0.6)',
  },
  time: {
    color: theme.colors.textTertiary,
    fontSize: 11,
    marginTop: theme.spacing.xs,
  },
  timeBroadcast: {
    color: 'rgba(255,255,255,0.35)',
  },

  unreadDot: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
});
