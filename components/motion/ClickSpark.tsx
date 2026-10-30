// Native port inspired by React Bits ClickSpark (https://reactbits.dev) — MIT + Commons Clause.
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import { Canvas, Group, Line, vec } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useMotionPalette } from './palette';

export interface ClickSparkProps {
  children: ReactNode;
  sparkColor?: string;
  /** Number of rays. Default 8. */
  sparkCount?: number;
  /** Ray length in px. Default 10. */
  sparkSize?: number;
  /** How far rays travel in px. Default 22. */
  sparkRadius?: number;
  /** Milliseconds. Default 450. */
  duration?: number;
  disabled?: boolean;
  className?: string;
}

interface SparkProps {
  index: number;
  count: number;
  size: number;
  radius: number;
  color: string;
  progress: SharedValue<number>;
  cx: SharedValue<number>;
  cy: SharedValue<number>;
}

function Spark({ index, count, size, radius, color, progress, cx, cy }: SparkProps) {
  const angle = (index / count) * Math.PI * 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const p1 = useDerivedValue(() => {
    const d = radius * progress.value;
    return vec(cx.value + dx * d, cy.value + dy * d);
  });
  const p2 = useDerivedValue(() => {
    const d = radius * progress.value + size * (1 - progress.value);
    return vec(cx.value + dx * d, cy.value + dy * d);
  });
  return <Line p1={p1} p2={p2} color={color} style="stroke" strokeWidth={2} strokeCap="round" />;
}

/** Radiating sparks at the tap point. Does not intercept the child's own presses. */
export function ClickSpark({
  children,
  sparkColor,
  sparkCount = 8,
  sparkSize = 10,
  sparkRadius = 22,
  duration = 450,
  disabled = false,
  className,
}: ClickSparkProps) {
  const reduced = useReducedMotion();
  const palette = useMotionPalette();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const progress = useSharedValue(1);
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);
  const opacity = useDerivedValue(() => 1 - progress.value);

  const tap = useTapGesture({
    maxDuration: 600,
    onActivate: (e) => {
      'worklet';
      cx.value = e.x;
      cy.value = e.y;
      progress.value = 0;
      progress.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
    },
  });

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const inner = (
    <View onLayout={onLayout} className={className}>
      {children}
      {!reduced && !disabled && size.w > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: 0, top: 0, width: size.w, height: size.h }}
        >
          <Canvas style={{ width: size.w, height: size.h }}>
            <Group opacity={opacity}>
              {Array.from({ length: sparkCount }, (_, i) => (
                <Spark
                  key={i}
                  index={i}
                  count={sparkCount}
                  size={sparkSize}
                  radius={sparkRadius}
                  color={sparkColor ?? palette.primary}
                  progress={progress}
                  cx={cx}
                  cy={cy}
                />
              ))}
            </Group>
          </Canvas>
        </View>
      ) : null}
    </View>
  );
  if (reduced || disabled) return inner;
  return <GestureDetector gesture={tap}>{inner}</GestureDetector>;
}
