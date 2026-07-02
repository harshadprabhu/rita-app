import { ViewStyle } from 'react-native';
import { TicketStatus, TicketLifecycle, TicketPriority } from '../types';

const shadowSm: ViewStyle = {
  shadowColor: '#0F1C2E',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.07,
  shadowRadius: 3,
  elevation: 2,
};

const shadowMd: ViewStyle = {
  shadowColor: '#0F1C2E',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 5,
};

export const theme = {
  colors: {
    brand: '#1E3A5F',
    brandMid: '#2D5282',
    accent: '#C9A84C',
    accentLight: '#FDF6E3',
    bg: '#F4F6F9',
    surface: '#FFFFFF',
    surface2: '#F8F9FB',
    textPrimary: '#0F1C2E',
    textSecondary: '#5A6A7E',
    textTertiary: '#9AAABB',
    border: '#E8ECF2',
    borderStrong: '#D1D9E6',
    error: '#EF4444',
    errorBg: '#FEE2E2',
    errorLight: '#FEF2F2',
    errorBorder: '#FECACA',
    errorStrong: '#DC2626',
  },
  statusColors: {
    open: { text: '#2563EB', bg: '#EFF6FF', accent: '#2563EB' },
    in_progress: { text: '#D97706', bg: '#FFFBEB', accent: '#D97706' },
    resolved: { text: '#059669', bg: '#ECFDF5', accent: '#059669' },
  } satisfies Record<TicketStatus, { text: string; bg: string; accent: string }>,
  lifecycleColors: {
    open: { text: '#2563EB', bg: '#EFF6FF', accent: '#2563EB' },
    being_worked_on: { text: '#D97706', bg: '#FFFBEB', accent: '#D97706' },
    pending_your_action: { text: '#7C3AED', bg: '#F5F3FF', accent: '#7C3AED' },
    escalated: { text: '#DC2626', bg: '#FEF2F2', accent: '#DC2626' },
    resolved: { text: '#059669', bg: '#ECFDF5', accent: '#059669' },
    closed: { text: '#6B7280', bg: '#F9FAFB', accent: '#6B7280' },
  } satisfies Record<TicketLifecycle, { text: string; bg: string; accent: string }>,
  priorityColors: {
    low: '#059669',
    medium: '#D97706',
    high: '#DC2626',
    critical: '#7C2D12',
  } satisfies Record<TicketPriority, string>,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 999,
  },
  shadows: {
    sm: shadowSm,
    md: shadowMd,
  },
};
