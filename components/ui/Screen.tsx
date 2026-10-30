import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cn } from './cn';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  contentClassName?: string;
  edges?: readonly Edge[];
  /** Skip the page background, e.g. when an animated backdrop sits behind the screen. */
  transparent?: boolean;
}

export function Screen({
  children,
  scroll = false,
  className,
  contentClassName,
  edges,
  transparent = false,
}: ScreenProps) {
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      className="flex-1"
      contentContainerClassName={cn('flex-grow px-4 py-4', contentClassName)}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cn('flex-1 px-4 py-4', contentClassName)}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges}
      className={cn('flex-1', !transparent && 'bg-background', className)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
