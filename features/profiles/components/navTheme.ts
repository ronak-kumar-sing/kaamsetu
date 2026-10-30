import { useColorScheme } from 'react-native';

export type NavColors = {
  active: string;
  inactive: string;
  background: string;
  border: string;
  foreground: string;
};

// Hex mirrors of the tokens in global.css (react-navigation can't read CSS variables).
const LIGHT: NavColors = {
  active: '#0F766E',
  inactive: '#64748B',
  background: '#FFFFFF',
  border: '#E2E8F0',
  foreground: '#0F172A',
};
const DARK: NavColors = {
  active: '#2DD4BF',
  inactive: '#94A3B8',
  background: '#0F172A',
  border: '#334155',
  foreground: '#F1F5F9',
};

export function useNavColors(): NavColors {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
