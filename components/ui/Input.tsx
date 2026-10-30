import type { ReactNode, Ref } from 'react';
import {
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  View,
  Text as RNText,
} from 'react-native';
import { cn } from './cn';
import { Text } from './Text';

export type InputProps = TextInputProps & {
  ref?: Ref<TextInputInstance>;
  label?: string;
  error?: string;
  hint?: string;
  leftAdornment?: ReactNode;
};

export function Input({
  ref,
  label,
  error,
  hint,
  leftAdornment,
  className,
  editable,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: InputProps) {
  const isDisabled = editable === false;

  return (
    <View className="gap-1.5">
      {label ? <RNText className="text-sm font-medium text-foreground">{label}</RNText> : null}
      <View
        className={cn(
          'min-h-[48px] flex-row items-center rounded-xl border bg-surface px-3.5',
          error ? 'border-danger' : 'border-border',
          isDisabled && 'opacity-50',
        )}
      >
        {leftAdornment ? <View className="mr-2">{leftAdornment}</View> : null}
        <TextInput
          ref={ref}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint ?? error ?? hint}
          className={cn('flex-1 py-3 text-base text-foreground placeholder:text-muted', className)}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
}
