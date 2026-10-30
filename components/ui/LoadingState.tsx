import { ActivityIndicator, View } from 'react-native';
import { cn } from './cn';
import { Text } from './Text';
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { cssInterop } from 'nativewind';

// NativeWind does not style Reanimated's Animated.View by default, so className needs registering.
cssInterop(Animated.View, { className: 'style' });

export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      accessibilityState={{ busy: true }}
      className="flex-1 items-center justify-center gap-3 px-6 py-10"
    >
      <ActivityIndicator size="large" className="text-primary" />
      {label ? (
        <Text variant="caption" className="text-center">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export interface SkeletonProps {
  className?: string;
}

/** Pulsing placeholder block. Holds still when the user has enabled reduced motion. */
export function Skeleton({ className }: SkeletonProps) {
  const pulse = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.4, { duration: 800 }), -1, true);
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={animatedStyle} className={cn('rounded-xl bg-surface-muted', className)} />
  );
}
