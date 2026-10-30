import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from './cn';

export type TextVariant = 'title' | 'heading' | 'subheading' | 'body' | 'caption' | 'label';
export type TextTone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'warning';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  className?: string;
}

const VARIANT_CLASSES: Record<TextVariant, string> = {
  title: 'text-[28px] leading-[34px] font-bold',
  heading: 'text-xl leading-7 font-semibold',
  subheading: 'text-base leading-6 font-semibold',
  body: 'text-[15px] leading-[22px]',
  caption: 'text-[13px] leading-[18px]',
  label: 'text-[13px] leading-[18px] font-medium uppercase tracking-wide',
};

const TONE_CLASSES: Record<TextTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted',
  primary: 'text-primary',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
};

/** Themed text. Captions default to the muted tone; everything else defaults to foreground. */
export function Text({ variant = 'body', tone, className, accessibilityRole, ...rest }: TextProps) {
  const resolvedTone = tone ?? (variant === 'caption' ? 'muted' : 'default');
  const role =
    accessibilityRole ?? (variant === 'title' || variant === 'heading' ? 'header' : undefined);
  return (
    <RNText
      accessibilityRole={role}
      className={cn(VARIANT_CLASSES[variant], TONE_CLASSES[resolvedTone], className)}
      {...rest}
    />
  );
}
