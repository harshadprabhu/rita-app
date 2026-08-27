import { Alert, Platform, AlertButton } from 'react-native';

/**
 * Drop-in replacement for React Native's Alert.alert that actually works on
 * web. react-native-web's Alert.alert is a hard no-op (`static alert() {}`)
 * — every call site using the bare RN Alert on web silently did nothing:
 * no dialog, no button, no callback ever fired. That was the root cause of
 * "nothing happens when I tap Delete" on web specifically (native was fine,
 * since RN's real Alert works there).
 *
 * On native this delegates straight to Alert.alert. On web:
 * - Multi-button (confirm-style, e.g. Cancel/Delete) → window.confirm().
 *   OK path fires the non-cancel button's onPress; Cancel path fires the
 *   cancel-style button's onPress if any.
 * - Zero/one button (plain info/error alert) → window.alert(), then fires
 *   the single button's onPress if provided.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }

  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const confirmBtn = buttons.find((b) => b !== cancelBtn) ?? buttons[buttons.length - 1];

  if (window.confirm(text)) {
    confirmBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}
