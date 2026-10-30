// Native port inspired by React Bits SpotlightCard (https://reactbits.dev) — MIT + Commons Clause.
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { Canvas, Rect, RadialGradient, vec } from '@shopify/react-native-skia';
import {
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../ui/cn';
import { useMotionPalette, withAlpha } from './palette';

export interface SpotlightCardProps {
  children: ReactNode;
  /** Spotlight colour (#RRGGBB). Defaults to the primary colour. */
  spotlightColor?: string;
  /** Peak spotlight opacity, 0-1. Default 0.22. */
  intensity?: number;
  /** Spotlight radius in px. Default 160. */
  radius?: number;
  className?: string;
}

/** Card with a soft radial spotlight that follows the finger. Use sparingly (hero card). */
export function SpotlightCard({
  children,
  spotlightColor,
  intensity = 0.22,
  radius = 160,
  className,
}: SpotlightCardProps) {
  const reduced = useReducedMotion();
  const palette = useMotionPalette();
  const color = spotlightColor ?? palette.primary;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);

  const gesture = usePanGesture({
    minDistance: 0,
    failOffsetY: [-12, 12],
    onBegin: (e) => {
      'worklet';
      x.value = e.x;
      y.value = e.y;
      opacity.value = withTiming(1, { duration: 160 });
    },
    onUpdate: (e) => {
      'worklet';
      x.value = e.x;
      y.value = e.y;
    },
    onFinalize: () => {
      'worklet';
      opacity.value = withTiming(0, { duration: 320 });
    },
  });

  const center = useDerivedValue(() => vec(x.value, y.value));
  // Touch is the only driver; keep the reaction hook out when reduced motion is on.
  useAnimatedReaction(
    () => reduced,
    (r) => {
      if (r) opacity.value = 0;
    },
  );

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const body = (
    <View
      onLayout={onLayout}
      className={cn('overflow-hidden rounded-2xl border border-border bg-surface p-4', className)}
    >
      {!reduced && size.w > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size.w,
            height: size.h,
            opacity: 1,
          }}
        >
          <Canvas style={{ width: size.w, height: size.h }} opaque={false}>
            <Rect x={0} y={0} width={size.w} height={size.h} opacity={opacity}>
              <RadialGradient
                c={center}
                r={radius}
                colors={[withAlpha(color, intensity), withAlpha(color, 0)]}
              />
            </Rect>
          </Canvas>
        </View>
      ) : null}
      {children}
    </View>
  );
  if (reduced) return body;
  return <GestureDetector gesture={gesture}>{body}</GestureDetector>;
}
