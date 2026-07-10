import { Platform, TextStyle, ViewStyle } from 'react-native';
import { TicketStatus, TicketLifecycle, TicketPriority } from '../types';

// Cross-platform serif stack for the "luxury jewellery" display headings in the
// Figma design (approximates Cormorant Garamond without bundling a font file).
const serifFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Times New Roman", serif',
}) as string;

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
    // Indriya-inspired luxury palette (Figma "Modern App Design" tokens):
    // deep midnight navy + refined warm gold, set on soft cream backgrounds
    // for a premium jewellery-brand feel.
    brand: '#1A2D5C',        // NAVY
    brandDeep: '#0F1B38',    // deepest navy (gradient tail / gold-rate card)
    brandMid: '#2E4E8A',     // brushed steel-blue highlight
    accent: '#C8963E',       // GOLD
    accentBright: '#E0B55A', // GOLD2 (gradient / highlights)
    accentLight: '#FDF6EC',  // pale gold wash
    bg: '#EDE8DC',           // CREAM
    surface: '#FFFFFF',
    surface2: '#F4F0E8',
    textPrimary: '#1A1614',  // INK
    textSecondary: '#6B6259',// SUB
    textTertiary: '#A89D95', // MUTED
    border: 'rgba(26,45,92,0.07)',
    borderStrong: 'rgba(26,45,92,0.14)',
    error: '#EF4444',
    errorBg: '#FEE2E2',
    errorLight: '#FEF2F2',
    errorBorder: '#FECACA',
    errorStrong: '#DC2626',
  },
  // Multi-stop gradients (use with expo-linear-gradient <LinearGradient colors=…>).
  gradients: {
    // Brushed steel-blue metallic navy — every navy surface (headers, active
    // pills, FAB). Pair with `navyMetalLocations`.
    navyMetal: ['#2E4E8A', '#1A2D5C', '#111E3D', '#1F3670', '#162448'] as const,
    navyMetalLocations: [0, 0.28, 0.55, 0.72, 1] as const,
    // Thin specular highlight stripe for the top/bottom edge of navy surfaces.
    metalEdge: ['transparent', 'rgba(180,210,255,0.28)', 'transparent'] as const,
    // Gold CTA (buttons, FAB, poster).
    gold: ['#E0B55A', '#C8963E'] as const,
    // Gold-rate card body.
    goldCard: ['#1F3569', '#0F1B38'] as const,
  },
  fonts: {
    serif: serifFamily,
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
