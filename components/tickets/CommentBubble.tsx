import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CommentWithAuthor } from '../../types/ticket';
import { timeAgo } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

interface Props {
  comment: CommentWithAuthor;
  isOwnComment: boolean;
}

export function CommentBubble({ comment, isOwnComment }: Props) {
  const { t } = useTranslation();
  const isInternal = comment.is_internal;
  // Sampark-synced notes have no RITA author; fall back to their external name.
  const authorName = comment.author?.display_name ?? comment.external_author ?? t('comments.unknownAuthor');
  const initials = authorName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const avatarEl = (
    <View style={[styles.avatar, isOwnComment ? styles.avatarOwn : styles.avatarOther, isInternal && !isOwnComment && styles.avatarInternal]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );

  return (
    <View style={[styles.row, isOwnComment ? styles.rowRight : styles.rowLeft]}>
      {!isOwnComment && avatarEl}
      <View style={[styles.bubble, isOwnComment ? styles.bubbleOwn : styles.bubbleOther, isInternal && !isOwnComment && styles.bubbleInternal, isInternal && isOwnComment && styles.bubbleOwnInternal]}>
        <View style={styles.authorRow}>
          {isInternal && <Ionicons name="lock-closed" size={11} color={isOwnComment ? 'rgba(255,255,255,0.6)' : '#8B5CF6'} />}
          <Text style={[styles.author, isOwnComment ? styles.authorOwn : styles.authorOther]}>
            {isOwnComment ? t('comments.you') : authorName}
          </Text>
        </View>
        <Text style={[styles.body, isOwnComment && styles.bodyOwn]}>{comment.body}</Text>
        <Text style={[styles.time, isOwnComment && styles.timeOwn]}>{timeAgo(comment.created_at)}</Text>
      </View>
      {isOwnComment && avatarEl}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginHorizontal: theme.spacing.md, marginVertical: theme.spacing.xs - 1, alignItems: 'flex-end', gap: theme.spacing.sm - 2 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: theme.radius.full, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 },
  avatarOther: { backgroundColor: theme.colors.brand },
  avatarOwn: { backgroundColor: theme.colors.accent },
  avatarInternal: { backgroundColor: '#EDE9FE' },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  bubble: { maxWidth: '75%', paddingHorizontal: theme.spacing.md + 1, paddingVertical: theme.spacing.sm + 1, ...theme.shadows.sm },
  bubbleOther: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, borderBottomLeftRadius: 3 },
  bubbleOwn: { backgroundColor: theme.colors.brand, borderRadius: 10, borderBottomRightRadius: 3 },
  bubbleInternal: { backgroundColor: '#F5F0FF', borderWidth: 1, borderColor: '#C4B5FD', borderRadius: 10, borderBottomLeftRadius: 3, opacity: 0.92 },
  bubbleOwnInternal: { opacity: 0.88 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs - 1, marginBottom: theme.spacing.xs - 1 },
  author: { fontSize: 11, fontWeight: '700' },
  authorOther: { color: theme.colors.textSecondary },
  authorOwn: { color: 'rgba(255,255,255,0.65)' },
  body: { fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20 },
  bodyOwn: { color: '#fff' },
  time: { fontSize: 10, color: theme.colors.textTertiary, marginTop: theme.spacing.xs, textAlign: 'right' },
  timeOwn: { color: 'rgba(255,255,255,0.5)' },
});
