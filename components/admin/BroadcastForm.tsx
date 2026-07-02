import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DbStore } from '../../types';
import { StoreSearchPicker } from './StoreSearchPicker';
import { theme } from '../../constants/theme';

interface Props {
  stores: DbStore[];
  onSubmit: (payload: {
    title: string;
    body: string;
    target_store_ids: string[];
  }) => void;
  isLoading?: boolean;
}

export function BroadcastForm({ stores, onSubmit, isLoading }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [storeIds, setStoreIds] = useState<string[]>([]);

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) return;
    onSubmit({ title: title.trim(), body: body.trim(), target_store_ids: storeIds });
    setTitle('');
    setBody('');
    setStoreIds([]);
  };

  const canSend = !!title.trim() && !!body.trim() && !isLoading;

  const selectedStoreName =
    storeIds.length === 1 ? stores.find((s) => s.id === storeIds[0])?.name : null;

  const sendLabel =
    storeIds.length === 0 ? t('broadcasts.form.sendToAll') :
    storeIds.length === 1 ? t('broadcasts.form.sendToStore', { store: selectedStoreName ?? t('broadcasts.form.selectedStoreFallback') }) :
    t('broadcasts.form.sendToStores', { n: storeIds.length });

  return (
    <View style={[styles.card, theme.shadows.sm]}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          <Ionicons name="megaphone" size={18} color={theme.colors.brand} />
        </View>
        <Text style={styles.cardTitle}>{t('broadcasts.form.sendBroadcast')}</Text>
      </View>

      {/* Title input */}
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('broadcasts.form.titlePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
        />
      </View>

      {/* Message input */}
      <View style={[styles.inputWrap, styles.inputWrapTall]}>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={body}
          onChangeText={setBody}
          placeholder={t('broadcasts.form.messagePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Store selector */}
      <StoreSearchPicker
        stores={stores}
        multiple
        selectedIds={storeIds}
        onMultiSelect={setStoreIds}
        label={t('broadcasts.form.storePickerLabel')}
      />

      {/* Send button */}
      <TouchableOpacity
        style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
        onPress={handleSubmit}
        disabled={!canSend}
        activeOpacity={0.8}
      >
        <Text style={styles.sendBtnText}>{sendLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  iconBox: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.brand + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontWeight: '700',
    color: theme.colors.textPrimary,
    fontSize: 15,
  },
  inputWrap: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  inputWrapTall: {
    minHeight: theme.spacing.xxl * 4,
  },
  input: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    padding: 0,
  },
  inputMultiline: {
    flex: 1,
    paddingTop: theme.spacing.xs,
    textAlignVertical: 'top',
  },
  sendBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.borderStrong,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
