import type { ReactNode } from 'react';
import { View } from 'react-native';

import { FadeContent } from '../motion/FadeContent';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <FadeContent direction="up" className="flex-1 items-center justify-center gap-3 px-6 py-10">
      {icon ? (
        <View className="mb-1 h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted">
          {icon}
        </View>
      ) : null}
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" className="text-center">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-2">
          <Button title={actionLabel} onPress={onAction} variant="primary" />
        </View>
      ) : null}
    </FadeContent>
  );
}
