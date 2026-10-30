import type { ReactNode } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
}

const ROW_CLASSES = 'min-h-[56px] flex-row items-center gap-3 px-4 py-3';

export function ListItem({ title, subtitle, right, left, onPress }: ListItemProps) {
  const content = (
    <>
      {left ? <View>{left}</View> : null}
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{title}</Text>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
      {onPress ? (
        <RNText
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="text-2xl text-muted"
        >
          ›
        </RNText>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        onPress={onPress}
        className={`${ROW_CLASSES} active:bg-surface-muted`}
      >
        {content}
      </Pressable>
    );
  }

  return <View className={ROW_CLASSES}>{content}</View>;
}
