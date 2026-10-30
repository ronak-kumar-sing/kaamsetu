// Native port inspired by React Bits button press feedback (https://reactbits.dev) — MIT + Commons Clause.
import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export interface PressableScaleProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  /** Scale while pressed. Default 0.97. */
  pressedScale?: number;
  className?: string;
  /** Class applied to the inner animated view. */
  innerClassName?: string;
}

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

/** Pressable that springs to a slightly smaller scale while pressed. */
export function PressableScale({
  children,
  pressedScale = 0.97,
  className,
  innerClassName,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      className={className}
      onPressIn={(e) => {
        if (!reduced) scale.set(withSpring(pressedScale, SPRING));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) scale.set(withSpring(1, SPRING));
        onPressOut?.(e);
      }}
      {...rest}
    >
      {/* Animated transform on the wrapper, classes on a plain View: NativeWind drops className
          styles when they share a component with a Reanimated animated style. */}
      <Animated.View style={style}>
        <View className={innerClassName}>{children}</View>
      </Animated.View>
    </Pressable>
  );
}
