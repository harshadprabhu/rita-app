import { TextStyle, ViewStyle } from 'react-native';
import { TicketStatus, TicketLifecycle, TicketPriority } from '../types';

// Suppresses the browser's default focus ring on web (outlineWidth: 0 alone
// isn't enough — Chromium's default outline-style: auto ignores an explicit
// width). RN's TextStyle types don't include 'none' for this web-only CSS
// property, hence the cast. Spread into a TextInput's style when it has its
// own custom focus treatment (e.g. a highlighted border) that would otherwise
// visually clash with the native ring.
export const webNoOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

const shadowXs: ViewStyle = {
  shadowColor: '#0F1C2E',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 2,
  elevation: 1,
};

const shadowSm: ViewStyle = {
  shadowColor: '#0F1C2E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 2,
};

const shadowMd: ViewStyle = {
  shadowColor: '#0F1C2E',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.11,
  shadowRadius: 16,
  elevation: 5,
};

const shadowLg: ViewStyle = {
  shadowColor: '#0F1C2E',
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.14,
  shadowRadius: 28,
  elevation: 9,
};

// Subtle brand-tinted glow for primary CTAs — a soft halo instead of a flat
// black drop shadow reads as more premium on a saturated navy button.
const shadowBrand: ViewStyle = {
  shadowColor: '#132C4D',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.3,
  shadowRadius: 18,
  elevation: 6,
};

export const theme = {
  colors: {
    // Indriya-inspired luxury palette: deep midnight navy + refined warm gold,
    // set on soft ivory backgrounds for a premium jewellery-brand feel.
    brand: '#132C4D',
    brandMid: '#28517F',
    accent: '#C6A14C',
    accentLight: '#FAF2DD',
    bg: '#F5F2EB',
    surface: '#FFFFFF',
    surface2: '#F2EDE3',
    textPrimary: '#132236',
    textSecondary: '#5C6B7E',
    textTertiary: '#98A4B2',
    border: '#E9E2D4',
    borderStrong: '#D7CEBD',
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
    xl: 20,
    xxl: 28,
    full: 999,
  },
  shadows: {
    xs: shadowXs,
    sm: shadowSm,
    md: shadowMd,
    lg: shadowLg,
    brand: shadowBrand,
  },
};
