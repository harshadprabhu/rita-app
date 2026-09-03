import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Text, Switch } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '../../constants/theme';

interface Props {
  /** Return a promise so the composer can await the send and only clear on
   *  resolve. Prevents the "typed, tapped send, message vanished" bug when
   *  a POST silently fails — the draft stays in the field to retry. */
  onSubmit: (body: string, isInternal: boolean) => Promise<unknown> | unknown;
  isSubmitting?: boolean;
  canMarkInternal?: boolean;
  /** Tapped the attach (📎) button — parent opens the camera/gallery/doc
   *  picker and uploads. Attachments are a separate flow from text. */
  onAttach?: () => void;
}

export function CommentInput({ onSubmit, isSubmitting, canMarkInternal, onAttach }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [focused, setFocused] = useState(false);

  const handleSubmit = () => {
    const text = body.trim();
    if (!text) return;
    // Fire-and-forget: clear the field IMMEDIATELY and let the parent handle
    // the send optimistically (the message shows right away with a pending
    // tick and reconciles/marks-failed on its own). We intentionally do NOT
    // await or gate on `isSubmitting` here — awaiting a slow/hung Sampark POST
    // was what left the button greyed after a couple of messages. WhatsApp
    // lets you keep typing while a message is still in flight; so do we.
    onSubmit(text, isInternal);
    setBody('');
  };

  // Only gate on having text — never on in-flight state, so the button can't
  // get stuck disabled if a previous send is slow or failed.
  const canSend = !!body.trim();
  const activeBorderColor = isInternal ? '#8B5CF6' : theme.colors.brand;
  const borderColor = focused ? activeBorderColor : theme.colors.border;

  return (
    <View style={[styles.container, isInternal && styles.containerInternal]}>
      {canMarkInternal && (
        <View style={styles.internalRow}>
          <Ionicons
            name="lock-closed"
            size={12}
            color={isInternal ? '#8B5CF6' : theme.colors.textTertiary}
          />
          <Text style={[styles.internalLabel, isInternal && styles.internalLabelActive]}>
            {t('comments.internalNote')}
          </Text>
          <Switch value={isInternal} onValueChange={setIsInternal} color="#8B5CF6" />
        </View>
      )}

      <View style={styles.inputRow}>
        {onAttach && (
          <TouchableOpacity onPress={onAttach} style={styles.attachBtn} activeOpacity={0.7} hitSlop={6}>
            <Ionicons name="add" size={24} color={theme.colors.brand} />
          </TouchableOpacity>
        )}
        <View style={[styles.inputWrap, { borderColor }]}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('comments.addComment')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            style={styles.input}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSend}
          style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnIdle]}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm + 2,
    paddingBottom: Platform.OS === 'ios' ? theme.spacing.md + 2 : theme.spacing.md,
    gap: theme.spacing.sm - 2,
  },
  containerInternal: {
    backgroundColor: '#FAFAFF',
  },

  internalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm - 2,
    paddingHorizontal: theme.spacing.xs - 2,
  },
  internalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    flex: 1,
  },
  internalLabelActive: {
    color: '#8B5CF6',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  attachBtn: {
    width: 44, height: 44, borderRadius: theme.radius.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5, borderColor: theme.colors.border,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 11 : 9,
    paddingBottom: Platform.OS === 'ios' ? 11 : 9,
    minHeight: 48,
    maxHeight: 130,
    justifyContent: 'center',
  },
  input: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    padding: 0,
    margin: 0,
    maxHeight: 108,
    lineHeight: 21,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: theme.colors.brand,
  },
  sendBtnIdle: {
    backgroundColor: theme.colors.borderStrong,
  },
});
