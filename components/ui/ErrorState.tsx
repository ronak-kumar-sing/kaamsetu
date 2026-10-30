import { View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <View accessibilityRole="alert" className="flex-1 items-center justify-center gap-3 px-6 py-10">
      <Text variant="heading" tone="danger" className="text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" className="text-center">
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <View className="mt-2">
          <Button
            title="Try again"
            onPress={onRetry}
            variant="outline"
            accessibilityHint="Retries the failed request"
          />
        </View>
      ) : null}
    </View>
  );
}
