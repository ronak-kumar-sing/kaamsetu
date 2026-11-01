import { Pressable, Text as RNText } from 'react-native';

import { cn } from '@/components/ui';

export type IconName = 'up' | 'down' | 'remove';

const GLYPHS: Record<IconName, string> = { up: '↑', down: '↓', remove: '✕' };

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

/** 44pt glyph button with a spoken label (arrows and remove). */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  tone = 'default',
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-xl active:bg-surface-muted',
        disabled && 'opacity-30',
      )}
    >
      <RNText
        importantForAccessibility="no"
        className={cn('text-lg font-semibold', tone === 'danger' ? 'text-danger' : 'text-muted')}
      >
        {GLYPHS[icon]}
      </RNText>
    </Pressable>
  );
}
