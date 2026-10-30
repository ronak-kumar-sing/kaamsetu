import { Pressable, Text as RNText, View } from 'react-native';
import { cn } from './cn';
import { Text } from './Text';

export interface SelectableCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onToggle: () => void;
}

/** Checkbox-style card for picking one or more options, e.g. a user role. */
export function SelectableCard({ title, description, selected, onToggle }: SelectableCardProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      className={cn(
        'min-h-[44px] flex-row items-center gap-3 rounded-2xl border-2 p-4 active:bg-surface-muted',
        selected ? 'border-primary bg-primary/10' : 'border-border bg-surface',
      )}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        className={cn(
          'h-6 w-6 items-center justify-center rounded-full border-2',
          selected ? 'border-primary bg-primary' : 'border-border bg-surface',
        )}
      >
        {selected ? <RNText className="text-xs font-bold text-primary-foreground">✓</RNText> : null}
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{title}</Text>
        {description ? <Text variant="caption">{description}</Text> : null}
      </View>
    </Pressable>
  );
}
