import { View } from 'react-native';

import { cn } from '@/components/ui';

export interface ShareBarProps {
  pct: number;
  over?: boolean;
}

/** Thin progress bar showing a milestone's share of the project total. */
export function ShareBar({ pct, over = false }: ShareBarProps) {
  const width = `${Math.max(0, Math.min(100, pct))}%` as const;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-2 overflow-hidden rounded-full bg-surface-muted"
    >
      <View
        style={{ width }}
        className={cn('h-2 rounded-full', over ? 'bg-danger' : 'bg-primary')}
      />
    </View>
  );
}
