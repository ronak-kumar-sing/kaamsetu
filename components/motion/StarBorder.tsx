// Native port inspired by React Bits StarBorder (https://reactbits.dev) — MIT + Commons Clause.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotionPalette, withAlpha } from './palette';

export interface StarBorderProps {
  children: ReactNode;
  /** Colour of the travelling light. Defaults to primary. */
  color?: string;
  /** Border radius in px. Default 999 (pill), clamped to half the height. */
  radius?: number;
  /** Stroke width in px. Default 1.5. */
  thickness?: number;
  /** Seconds per lap. Default 4. */
  speed?: number;
  /** Fraction of the perimeter that is lit, 0-1. Default 0.22. */
  length?: number;
  paused?: boolean;
  className?: string;
}

/** Wrapper with a light travelling along its border. Reserve for premium badges. */
export function StarBorder({
  children,
  color,
  radius = 999,
  thickness = 1.5,
  speed = 4,
  length = 0.22,
  paused = false,
  className,
}: StarBorderProps) {
  const reduced = useReducedMotion();
  const palette = useMotionPalette();
  const tint = color ?? palette.primary;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const progress = useSharedValue(0);

  useEffect(() => {
    if (paused || reduced) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: speed * 1000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [paused, reduced, speed, progress]);

  const path = useMemo(() => {
    const inset = thickness / 2;
    const w = Math.max(0, size.w - thickness);
    const h = Math.max(0, size.h - thickness);
    const r = Math.min(radius, h / 2, w / 2);
    return Skia.Path.RRect(Skia.RRectXY(Skia.XYWHRect(inset, inset, w, h), r, r));
  }, [size, radius, thickness]);

  const headEnd = useDerivedValue(() => Math.min(1, progress.value + length));
  const tailStart = useDerivedValue(() => 0);
  const tailEnd = useDerivedValue(() => Math.max(0, progress.value + length - 1));

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View onLayout={onLayout} className={className} style={{ padding: thickness }}>
      {size.w > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: 0, top: 0, width: size.w, height: size.h }}
        >
          <Canvas style={{ width: size.w, height: size.h }}>
            <Path
              path={path}
              style="stroke"
              strokeWidth={thickness}
              color={withAlpha(tint, reduced ? 0.7 : 0.25)}
            />
            {reduced ? null : (
              <>
                <Path
                  path={path}
                  style="stroke"
                  strokeWidth={thickness}
                  strokeCap="round"
                  color={tint}
                  start={progress}
                  end={headEnd}
                />
                <Path
                  path={path}
                  style="stroke"
                  strokeWidth={thickness}
                  strokeCap="round"
                  color={tint}
                  start={tailStart}
                  end={tailEnd}
                />
              </>
            )}
          </Canvas>
        </View>
      ) : null}
      {children}
    </View>
  );
}
