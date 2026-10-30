import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from '../motion/PressableScale';
import { cn } from './cn';

export interface CardProps {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
}

const BASE_CLASSES = 'rounded-2xl border border-border bg-surface p-4';

export function Card({ children, className, onPress }: CardProps) {
  if (onPress) {
    return (
      <PressableScale
        accessibilityRole="button"
        onPress={onPress}
        pressedScale={0.98}
        innerClassName={cn(BASE_CLASSES, className)}
      >
        {children}
      </PressableScale>
    );
  }
  return <View className={cn(BASE_CLASSES, className)}>{children}</View>;
}
