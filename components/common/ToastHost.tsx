import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiStore } from '../../stores/uiStore';
import { theme } from '../../constants/theme';

// Errors stay up longer — they carry messages the user actually needs to read
// (e.g. why an SSO sign-in failed), not just a quick confirmation.
const AUTO_DISMISS_MS: Record<'success' | 'error' | 'info', number> = {
  success: 3000,
  info: 4000,
  error: 8000,
};

const ICONS: Record<'success' | 'error' | 'info', keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

const COLORS: Record<'success' | 'error' | 'info', string> = {
  success: theme.statusColors.resolved.accent,
  error: theme.colors.errorStrong,
  info: theme.colors.brand,
};

/**
 * Renders stores/uiStore's toast queue. showToast() only pushed state before —
 * nothing (in this app or the source it was ported from) ever actually
 * displayed it. Mounted once in the root layout, above everything else.
 */
export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.container, { top: insets.top + theme.spacing.sm }]}>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} id={toast.id} message={toast.message} type={toast.type} onDismiss={dismissToast} />
      ))}
    </View>
  );
}

function ToastCard({
  id, message, type, onDismiss,
}: {
  id: string; message: string; type: 'success' | 'error' | 'info'; onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS[type]);
    return () => clearTimeout(timer);
  }, [id, type]);

  return (
    <View style={[styles.card, theme.shadows.lg, { borderLeftColor: COLORS[type] }]}>
      <Ionicons name={ICONS[type]} size={18} color={COLORS[type]} />
      <Text style={styles.message} numberOfLines={3}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    zIndex: 1000,
    gap: theme.spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderLeftWidth: 3,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
});
