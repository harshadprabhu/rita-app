import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Text, Switch } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '../../constants/theme';

interface Props {
  onSubmit: (body: string, isInternal: boolean) => void;
  isSubmitting?: boolean;
  canMarkInternal?: boolean;
}

export function CommentInput({ onSubmit, isSubmitting, canMarkInternal }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [focused, setFocused] = useState(false);

  const handleSubmit = () => {
    if (!body.trim()) return;
    onSubmit(body.trim(), isInternal);
    setBody('');
  };

  const canSend = !!body.trim() && !isSubmitting;
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
