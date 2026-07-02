import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '../../constants/theme';
import {
  AppLanguage,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  setLanguage,
} from '../../lib/i18n';

// Fallback slide distance used before the sheet has measured its real height.
const SHEET_START = 400;

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const active = i18n.language as AppLanguage;
  const [visible, setVisible] = useState(false);

  // Backdrop fades in place; only the sheet slides up — matching the
  // announcement modal (which RN's animationType="slide" can't do, since that
  // slides the dark backdrop along with the sheet).
  const backdrop = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SHEET_START)).current;
  const sheetHeight = useRef(SHEET_START);

  const open = () => setVisible(true);

  const close = () => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: sheetHeight.current, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setVisible(false); });
  };

  useEffect(() => {
    if (!visible) return;
    backdrop.setValue(0);
    translateY.setValue(sheetHeight.current);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240, mass: 0.9 }),
    ]).start();
  }, [visible]);

  const handleSelect = (lng: AppLanguage) => {
    setLanguage(lng);
    close();
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionLabel}>{t('profile.language')}</Text>

      {/* Trigger */}
      <TouchableOpacity
        style={[styles.trigger, theme.shadows.sm]}
        onPress={open}
        activeOpacity={0.8}
      >
        <View style={styles.triggerLeft}>
          <Ionicons name="language-outline" size={18} color={theme.colors.brand} />
          <Text style={styles.triggerText}>{LANGUAGE_NAMES[active]}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textTertiary} />
      </TouchableOpacity>

      {/* Bottom-sheet picker — fade backdrop + slide sheet */}
      <Modal visible={visible} animationType="none" transparent onRequestClose={close}>
        <View style={styles.root}>
          <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <Animated.View
            style={[styles.sheet, { transform: [{ translateY }] }]}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h) sheetHeight.current = h;
            }}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('profile.selectLanguage')}</Text>
              <TouchableOpacity
                onPress={close}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close" size={24} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {SUPPORTED_LANGUAGES.map((lng, idx) => {
              const selected = active === lng;
              return (
                <View key={lng}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => handleSelect(lng)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                      {LANGUAGE_NAMES[lng]}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={20} color={theme.colors.brand} />
                    )}
                  </TouchableOpacity>
                  {idx < SUPPORTED_LANGUAGES.length - 1 && <View style={styles.separator} />}
                </View>
              );
            })}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: theme.spacing.xs,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  triggerText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },

  // Bottom sheet
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingBottom: theme.spacing.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetTitle: {
    fontWeight: '700',
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  rowLabelSelected: {
    color: theme.colors.brand,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.lg,
  },
});
