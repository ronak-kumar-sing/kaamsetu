import type { ReactNode } from 'react';
import { Text as RNText, View } from 'react-native';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: ReactNode;
}

const CONTAINER_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted',
  primary: 'bg-primary/15',
  success: 'bg-success/15',
  warning: 'bg-warning/15',
  danger: 'bg-danger/15',
  info: 'bg-info/15',
};

const LABEL_CLASSES: Record<BadgeTone, string> = {
  neutral: 'text-muted',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export function Badge({ label, tone = 'neutral', icon }: BadgeProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 self-start rounded-full px-2.5 py-1',
        CONTAINER_CLASSES[tone],
      )}
    >
      {icon}
      <RNText className={cn('text-xs font-semibold', LABEL_CLASSES[tone])}>{label}</RNText>
    </View>
  );
}
