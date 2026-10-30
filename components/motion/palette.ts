import { useColorScheme } from 'react-native';

export interface MotionPalette {
  primary: string;
  foreground: string;
  muted: string;
  surface: string;
  background: string;
}

export const LIGHT_PALETTE: MotionPalette = {
  primary: '#0F766E',
  foreground: '#0F172A',
  muted: '#64748B',
  surface: '#FFFFFF',
  background: '#F8FAFC',
};

export const DARK_PALETTE: MotionPalette = {
  primary: '#2DD4BF',
  foreground: '#F1F5F9',
  muted: '#94A3B8',
  surface: '#0F172A',
  background: '#020617',
};

/** Semantic colours for motion components, following the system colour scheme. */
export function useMotionPalette(): MotionPalette {
  return useColorScheme() === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}

/** Applies an alpha (0-1) to a #RRGGBB colour. Other formats are returned unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
