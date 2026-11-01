import { Pressable, Text as RNText } from 'react-native';

import { cn } from '@/components/ui';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/** Toggleable pill used for categories and skills. */
export function Chip({ label, selected, onPress, disabled = false }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-[44px] justify-center rounded-full border px-4',
        selected ? 'border-primary bg-primary/15' : 'border-border bg-surface',
        disabled && 'opacity-40',
      )}
    >
      <RNText
        className={cn('text-sm', selected ? 'font-semibold text-primary' : 'text-foreground')}
      >
        {label}
      </RNText>
    </Pressable>
  );
}
