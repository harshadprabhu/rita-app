import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CommentWithAuthor } from '../../types/ticket';
import { SamparkMedia } from '../../lib/api/samparkComments';
import { timeAgo } from '../../lib/utils/date';
import { theme } from '../../constants/theme';

export type DeliveryStatus = 'sent' | 'delivered' | 'read';

interface Props {
  comment: CommentWithAuthor;
  isOwnComment: boolean;
  /** Where the note originated — drives bubble color so RITA users vs
   *  Sampark technicians are visually distinct, WhatsApp-style. Default
   *  'rita' preserves the old look for callers that don't yet pass it. */
  source?: 'rita' | 'sampark';
  /** WhatsApp-style delivery ticks — only meaningful on own (outgoing)
   *  messages. undefined hides ticks entirely (inbound / other users). */
  deliveryStatus?: DeliveryStatus;
  /** Outgoing message failed to send — show a red retry affordance. */
  failed?: boolean;
  onRetry?: () => void;
  /** Attached file (photo / video / document) carried by this message. */
  media?: SamparkMedia | null;
  /** Auth header the media proxy URL needs to load (native Image/Video). */
  mediaAuthHeader?: Record<string, string>;
}

export function CommentBubble({ comment, isOwnComment, source = 'rita', deliveryStatus, failed, onRetry, media, mediaAuthHeader }: Props) {
  const { t } = useTranslation();
  const isInternal = comment.is_internal;
  const isSampark = source === 'sampark';
  // Sampark-synced notes have no RITA author; fall back to their external name.
  const authorName = comment.author?.display_name ?? comment.external_author ?? t('comments.unknownAuthor');
  const initials = authorName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Three visual states, WhatsApp-inspired:
  //   • own (me, RITA)        → navy right-aligned  (accent avatar)
  //   • incoming RITA user    → white left-aligned  (navy avatar)
  //   • incoming Sampark tech → amber-tinted left   (amber avatar)
  const avatarStyle = isOwnComment
    ? styles.avatarOwn
    : isSampark
      ? styles.avatarSampark
      : styles.avatarOther;
  const bubbleStyle = isOwnComment
    ? styles.bubbleOwn
    : isSampark
      ? styles.bubbleSampark
      : styles.bubbleOther;

  const avatarEl = (
    <View style={[styles.avatar, avatarStyle, isInternal && !isOwnComment && styles.avatarInternal]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );

  return (
    <View style={[styles.row, isOwnComment ? styles.rowRight : styles.rowLeft]}>
      {!isOwnComment && avatarEl}
      <View style={[styles.bubble, bubbleStyle, isInternal && !isOwnComment && styles.bubbleInternal, isInternal && isOwnComment && styles.bubbleOwnInternal]}>
        <View style={styles.authorRow}>
          {isInternal && <Ionicons name="lock-closed" size={11} color={isOwnComment ? 'rgba(255,255,255,0.6)' : '#8B5CF6'} />}
          {!isOwnComment && isSampark && (
            <View style={styles.samparkTag}>
              <Text style={styles.samparkTagText}>SAMPARK</Text>
            </View>
          )}
          <Text style={[styles.author, isOwnComment ? styles.authorOwn : styles.authorOther]}>
            {isOwnComment ? t('comments.you') : authorName}
          </Text>
        </View>
        {media ? <MediaBlock media={media} authHeader={mediaAuthHeader} isOwn={isOwnComment} /> : null}
        {comment.body ? <Text style={[styles.body, isOwnComment && styles.bodyOwn]}>{comment.body}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={[styles.time, isOwnComment && styles.timeOwn]}>{timeAgo(comment.created_at)}</Text>
          {isOwnComment && failed ? (
            <TouchableOpacity onPress={onRetry} hitSlop={8} style={styles.retryWrap}>
              <Ionicons name="alert-circle" size={14} color="#FCA5A5" />
              <Text style={styles.retryText}>Failed — tap to retry</Text>
            </TouchableOpacity>
          ) : isOwnComment && deliveryStatus ? (
            <Ionicons
              // Single tick = sent (POSTed, not yet re-confirmed by Sampark).
              // Double tick = delivered (round-tripped through Sampark).
              // Double BLUE tick = read (a technician replied after it).
              name={deliveryStatus === 'sent' ? 'checkmark' : 'checkmark-done'}
              size={15}
              color={deliveryStatus === 'read' ? '#34B7F1' : 'rgba(255,255,255,0.7)'}
              style={styles.tick}
            />
          ) : null}
        </View>
      </View>
      {isOwnComment && avatarEl}
    </View>
  );
}

// Renders an attached photo (inline, tap to open), video, or document. The
// proxy URL needs the user's bearer token, passed as an Image source header on
// native; on web the header can't ride an <img>, so we tap-to-open instead.
function MediaBlock({ media, authHeader, isOwn }: { media: SamparkMedia; authHeader?: Record<string, string>; isOwn: boolean }) {
  const open = () => Linking.openURL(media.url).catch(() => {});
  if (media.kind === 'image') {
    return (
      <TouchableOpacity onPress={open} activeOpacity={0.85} style={mediaStyles.imageWrap}>
        <Image
          source={{ uri: media.url, headers: authHeader }}
          style={mediaStyles.image}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }
  const icon = media.kind === 'video' ? 'videocam' : 'document-text';
  return (
    <TouchableOpacity onPress={open} activeOpacity={0.8} style={[mediaStyles.fileChip, isOwn && mediaStyles.fileChipOwn]}>
      <Ionicons name={icon} size={22} color={isOwn ? '#fff' : theme.colors.brand} />
      <Text style={[mediaStyles.fileName, isOwn && { color: '#fff' }]} numberOfLines={1}>{media.name}</Text>
      <Ionicons name={media.kind === 'video' ? 'play-circle' : 'download-outline'} size={18} color={isOwn ? 'rgba(255,255,255,0.85)' : theme.colors.textTertiary} />
    </TouchableOpacity>
  );
}

const mediaStyles = StyleSheet.create({
  imageWrap: { borderRadius: 10, overflow: 'hidden', marginBottom: 4, backgroundColor: 'rgba(0,0,0,0.05)' },
  image: { width: 210, height: 210, maxWidth: '100%' },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
    backgroundColor: theme.colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    minWidth: 180,
  },
  fileChipOwn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  fileName: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary },
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginHorizontal: theme.spacing.md, marginVertical: theme.spacing.xs, alignItems: 'flex-end', gap: theme.spacing.sm },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: { width: 34, height: 34, borderRadius: theme.radius.full, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 },
  avatarOther: { backgroundColor: theme.colors.brand },
  avatarSampark: { backgroundColor: '#B45309' }, // amber-800, distinct from brand navy
  avatarOwn: { backgroundColor: theme.colors.accent },
  avatarInternal: { backgroundColor: '#EDE9FE' },
  avatarText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  bubble: { maxWidth: '76%', paddingHorizontal: theme.spacing.md + 2, paddingVertical: theme.spacing.sm + 2, ...theme.shadows.sm },
  bubbleOther: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, borderBottomLeftRadius: 3 },
  bubbleSampark: {
    backgroundColor: '#FFF7ED', // amber-50 — warm off-white so the WhatsApp
    borderWidth: 1, borderColor: '#FED7AA', // "someone else replied" cue is instant
    borderRadius: 12, borderBottomLeftRadius: 3,
  },
  bubbleOwn: { backgroundColor: theme.colors.brand, borderRadius: 12, borderBottomRightRadius: 3 },
  samparkTag: {
    backgroundColor: '#B45309', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4,
  },
  samparkTagText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  bubbleInternal: { backgroundColor: '#F5F0FF', borderWidth: 1, borderColor: '#C4B5FD', borderRadius: 12, borderBottomLeftRadius: 3, opacity: 0.92 },
  bubbleOwnInternal: { opacity: 0.88 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs },
  author: { fontSize: 13, fontWeight: '700' },
  authorOther: { color: theme.colors.textSecondary },
  authorOwn: { color: 'rgba(255,255,255,0.75)' },
  body: { fontSize: 15, color: theme.colors.textPrimary, lineHeight: 22 },
  bodyOwn: { color: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: theme.spacing.xs },
  time: { fontSize: 11, color: theme.colors.textTertiary, textAlign: 'right' },
  timeOwn: { color: 'rgba(255,255,255,0.6)' },
  tick: { marginBottom: -1 },
  retryWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryText: { fontSize: 10, fontWeight: '700', color: '#FCA5A5' },
});
