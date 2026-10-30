// Native port inspired by React Bits FadeContent (https://reactbits.dev) — MIT + Commons Clause.
import type { ReactNode } from 'react';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  useReducedMotion,
} from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

export interface FadeContentProps {
  children: ReactNode;
  /** Where the content slides in from. 'none' only fades. */
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  delay?: number;
  duration?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Fade (and optional short slide) entrance wrapper for any view. */
export function FadeContent({
  children,
  direction = 'up',
  delay = 0,
  duration = 450,
  className,
  style,
}: FadeContentProps) {
  const reduced = useReducedMotion();
  // "up" means the content rises into place, i.e. enters from below.
  const base =
    direction === 'up'
      ? FadeInDown
      : direction === 'down'
        ? FadeInUp
        : direction === 'left'
          ? FadeInRight
          : direction === 'right'
            ? FadeInLeft
            : FadeIn;
  const entering = base.delay(delay).duration(duration).easing(Easing.out(Easing.cubic));
  return (
    <Animated.View entering={reduced ? undefined : entering} className={className} style={style}>
      {children}
    </Animated.View>
  );
}
