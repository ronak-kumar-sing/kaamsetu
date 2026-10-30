// Native port inspired by React Bits ShinyText (https://reactbits.dev) — MIT + Commons Clause.
import { LinearGradient, vec } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { SkiaGradientText, type SkiaTextBaseProps } from './_SkiaText';
import { useMotionPalette } from './palette';

export interface ShinyTextProps extends SkiaTextBaseProps {
  /** Base text colour. Defaults to muted. */
  color?: string;
  /** Highlight colour. Defaults to foreground. */
  shineColor?: string;
  /** Sweep duration in ms. Default 2400. */
  speed?: number;
  /** Pause between sweeps in ms. Default 800. */
  pauseMs?: number;
  disabled?: boolean;
}

/** A highlight sweeps across the text on a loop (Skia text with an animated linear gradient). */
export function ShinyText({
  color,
  shineColor,
  speed = 2400,
  pauseMs = 800,
  disabled = false,
  ...rest
}: ShinyTextProps) {
  const reduced = useReducedMotion();
  const palette = useMotionPalette();
  const base = color ?? palette.muted;
  const shine = shineColor ?? palette.foreground;
  const progress = useSharedValue(0);
  useEffect(() => {
    if (disabled || reduced) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withDelay(pauseMs, withTiming(1, { duration: speed, easing: Easing.inOut(Easing.quad) })),
      -1,
      false,
    );
  }, [disabled, reduced, speed, pauseMs, progress]);

  return (
    <SkiaGradientText
      {...rest}
      fallbackColor={base}
      reduced={reduced || disabled}
      renderShader={(width) => (
        <ShinyShader width={width} base={base} shine={shine} progress={progress} />
      )}
    />
  );
}

function ShinyShader({
  width,
  base,
  shine,
  progress,
}: {
  width: number;
  base: string;
  shine: string;
  progress: SharedValue<number>;
}) {
  const band = width * 0.6;
  const start = useDerivedValue(() => vec(-band + progress.value * (width + band), 0));
  const end = useDerivedValue(() => vec(progress.value * (width + band), 0));
  return <LinearGradient start={start} end={end} colors={[base, shine, base]} />;
}
