import { Pressable, Text as RNText, View } from 'react-native';
import { cn } from './cn';
import { Text } from './Text';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

export interface BannerProps {
  tone: BannerTone;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const TONE_CLASSES: Record<BannerTone, { container: string; accent: string; action: string }> = {
  info: { container: 'bg-info/10', accent: 'bg-info', action: 'text-info' },
  warning: { container: 'bg-warning/10', accent: 'bg-warning', action: 'text-warning' },
  danger: { container: 'bg-danger/10', accent: 'bg-danger', action: 'text-danger' },
  success: { container: 'bg-success/10', accent: 'bg-success', action: 'text-success' },
};

export function Banner({ tone, title, message, actionLabel, onAction }: BannerProps) {
  const classes = TONE_CLASSES[tone];
  const isUrgent = tone === 'danger' || tone === 'warning';

  return (
    <View
      accessibilityRole={isUrgent ? 'alert' : undefined}
      className={cn('flex-row overflow-hidden rounded-2xl border border-border', classes.container)}
    >
      <View className={cn('w-1', classes.accent)} />
      <View className="flex-1 gap-1 p-4">
        <Text variant="subheading">{title}</Text>
        {message ? <Text variant="caption">{message}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={8}
            className="mt-1 min-h-[44px] flex-row items-center self-start active:opacity-70"
          >
            <RNText className={cn('font-semibold', classes.action)}>{actionLabel}</RNText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
