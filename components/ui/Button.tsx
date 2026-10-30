import type { ReactNode } from 'react';
import { ActivityIndicator, Text as RNText } from 'react-native';

import { PressableScale } from '../motion/PressableScale';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  accessibilityHint?: string;
}

const CONTAINER_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-surface-muted',
  outline: 'border border-border bg-surface',
  ghost: 'bg-transparent',
  danger: 'bg-danger',
};

/** Text (and spinner) colour per variant. Kept as a full class so NativeWind can detect it. */
const LABEL_TONE_CLASSES: Record<ButtonVariant, string> = {
  primary: 'text-primary-foreground',
  secondary: 'text-foreground',
  outline: 'text-foreground',
  ghost: 'text-primary',
  danger: 'text-primary-foreground',
};

const SIZE_CLASSES: Record<ButtonSize, { container: string; label: string }> = {
  sm: { container: 'min-h-[44px] rounded-xl px-3', label: 'text-sm' },
  md: { container: 'min-h-[48px] rounded-xl px-5', label: 'text-[15px]' },
  lg: { container: 'min-h-[56px] rounded-2xl px-6', label: 'text-base' },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  fullWidth = false,
  className,
  accessibilityHint,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const labelTone = LABEL_TONE_CLASSES[variant];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      className={cn(fullWidth && 'w-full', className)}
      innerClassName={cn(
        'flex-row items-center justify-center gap-2',
        SIZE_CLASSES[size].container,
        CONTAINER_CLASSES[variant],
        isDisabled && 'opacity-50',
      )}
    >
      {loading ? <ActivityIndicator size="small" className={labelTone} /> : leftIcon}
      <RNText className={cn('font-semibold', SIZE_CLASSES[size].label, labelTone)}>{title}</RNText>
    </PressableScale>
  );
}
