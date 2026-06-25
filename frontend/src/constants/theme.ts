/**
 * Nova design tokens - the dark "Nova" palette from the design mockup.
 * Pure React Native styling (no CSS).
 */

export const Colors = {
  bg: '#0A0A0F',
  bgElevated: '#14141C',
  bgCard: '#15151F',
  surface: '#1C1C28',

  text: '#ECECF2',
  textBright: '#F4F3FA',
  textSecondary: '#8A8A99',
  textMuted: '#6A6A7A',
  placeholder: '#5B5B6B',

  // Brand purple
  primary: '#7C5CFF',
  primaryLight: '#9D86FF',
  primaryDeep: '#6C4BFF',

  // Accents
  green: '#34D399',
  greenDeep: '#10B981',
  amber: '#FBBF24',
  red: '#FB7185',
  teal: '#6EE7C8',

  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.12)',
  divider: 'rgba(255,255,255,0.06)',
} as const;

export const Gradients = {
  brand: ['#8B6BFF', '#6C4BFF'] as const,
  brandIcon: ['#9D86FF', '#6C4BFF'] as const,
  userBubble: ['#7C5CFF', '#6342E8'] as const,
  greenButton: ['#34D399', '#10B981'] as const,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 26,
} as const;

export const Fonts = {
  // Space Grotesk in the mockup; system font keeps setup zero-config.
  display: 'System',
  body: 'System',
} as const;
