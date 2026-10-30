// Native port inspired by React Bits CountUp (https://reactbits.dev) — MIT + Commons Clause.
import { useEffect } from 'react';
import { TextInput, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useMotionPalette } from './palette';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Formatter run on the UI thread. Must carry the 'worklet' directive. */
export type WorkletFormat = (n: number) => string;

export interface CountUpProps {
  to: number;
  from?: number;
  /** Milliseconds. Default 1200. */
  duration?: number;
  delay?: number;
  /** Decimal places for the default formatter. Default 0. */
  decimals?: number;
  /** Custom formatter. MUST be a worklet (first statement 'worklet'). */
  format?: WorkletFormat;
  color?: string;
  className?: string;
  style?: StyleProp<TextStyle>;
}

/** Default worklet formatter: fixed decimals, no grouping. */
function makeDefaultFormat(decimals: number): WorkletFormat {
  return (n) => {
    'worklet';
    return n.toFixed(decimals);
  };
}

/**
 * Animates a number on the UI thread and writes it into a non-editable TextInput
 * (the standard Reanimated animated-number pattern). Always ends exactly on `to`.
 */
export function CountUp({
  to,
  from = 0,
  duration = 1200,
  delay = 0,
  decimals = 0,
  format,
  color,
  className,
  style,
}: CountUpProps) {
  const reduced = useReducedMotion();
  const palette = useMotionPalette();
  const progress = useSharedValue(reduced ? to : from);
  const fmt = format ?? makeDefaultFormat(decimals);

  useEffect(() => {
    if (reduced) {
      progress.value = to;
      return;
    }
    progress.value = from;
    progress.value = withDelay(
      delay,
      withTiming(to, { duration, easing: Easing.out(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) progress.value = to;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, from, duration, delay, reduced]);

  const animatedProps = useAnimatedProps(() => {
    const value = progress.value;
    const text = fmt(value === to ? to : value);
    return { text, defaultValue: text } as unknown as TextInputProps;
  });

  const finalText = fmt(to);
  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={reduced ? finalText : fmt(from)}
      animatedProps={animatedProps}
      accessibilityLabel={finalText}
      accessibilityRole="text"
      className={className}
      style={[
        { color: color ?? palette.foreground, padding: 0, fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
