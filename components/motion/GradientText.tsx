// Native port inspired by React Bits GradientText (https://reactbits.dev) — MIT + Commons Clause.
import { useEffect } from 'react';
import { LinearGradient, vec } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SkiaGradientText, type SkiaTextBaseProps } from './_SkiaText';
import { useMotionPalette } from './palette';

export interface GradientTextProps extends SkiaTextBaseProps {
  /** Two or more colours; the first is repeated at the end for a seamless loop. */
  colors?: string[];
  /** Full cycle duration in ms. Default 5000. */
  speed?: number;
  paused?: boolean;
}

/** Text filled with a slowly flowing gradient. */
export function GradientText({ colors, speed = 5000, paused = false, ...rest }: GradientTextProps) {
  const reduced = useReducedMotion();
  const palette = useMotionPalette();
  const stops =
    colors && colors.length >= 2 ? colors : [palette.primary, palette.foreground, palette.primary];
  const progress = useSharedValue(0);
  useEffect(() => {
    if (paused || reduced) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: speed, easing: Easing.linear }),
      -1,
      false,
    );
  }, [paused, reduced, speed, progress]);

  return (
    <SkiaGradientText
      {...rest}
      fallbackColor={stops[0] ?? palette.primary}
      reduced={reduced}
      renderShader={(width) => <FlowShader width={width} colors={stops} progress={progress} />}
    />
  );
}

function FlowShader({
  width,
  colors,
  progress,
}: {
  width: number;
  colors: string[];
  progress: SharedValue<number>;
}) {
  const loop = [...colors, colors[0] ?? '#000000'];
  const start = useDerivedValue(() => vec(progress.value * width, 0));
  const end = useDerivedValue(() => vec(progress.value * width + width, 0));
  return <LinearGradient start={start} end={end} colors={loop} mode="repeat" />;
}
