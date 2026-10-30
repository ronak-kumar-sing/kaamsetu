import { Pressable, Text as RNText, View } from 'react-native';
import { cn } from './cn';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View accessibilityRole="tablist" className="flex-row rounded-xl bg-surface-muted p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={cn(
              'min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 active:opacity-70',
              selected && 'bg-surface',
            )}
          >
            <RNText
              className={cn(
                'text-sm',
                selected ? 'font-semibold text-foreground' : 'font-medium text-muted',
              )}
            >
              {option.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
