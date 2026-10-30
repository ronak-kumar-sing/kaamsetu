// Native port inspired by React Bits Particles (https://reactbits.dev) — MIT + Commons Clause.
import { useMemo } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Points, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useMotionClock } from './useMotionClock';
import { useMotionPalette, withAlpha } from './palette';

export interface ParticlesProps {
  /** Number of dots, capped at 60. Default 36. */
  count?: number;
  color?: string;
  /** Drift speed multiplier. Default 1. */
  speed?: number;
  paused?: boolean;
  className?: string;
}

const MAX = 60;

interface Seed {
  x: number;
  y: number;
  drift: number;
  phase: number;
  rise: number;
}

function makeSeeds(n: number): Seed[] {
  // Deterministic LCG so layout is stable across renders.
  let s = 1234567;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return Array.from({ length: n }, () => ({
    x: rnd(),
    y: rnd(),
    drift: 6 + rnd() * 14,
    phase: rnd() * Math.PI * 2,
    rise: 0.004 + rnd() * 0.01,
  }));
}

/** Calm floating dots (max 60) drawn as two batched point layers on one canvas. */
export function Particles({
  count = 36,
  color,
  speed = 1,
  paused = false,
  className,
}: ParticlesProps) {
  const palette = useMotionPalette();
  const tint = color ?? palette.primary;
  const seeds = useMemo(() => makeSeeds(Math.min(MAX, Math.max(0, count))), [count]);
  const size = useSharedValue({ w: 1, h: 1 });
  const time = useMotionClock(paused, speed);

  const small = useDerivedValue(() => {
    const { w, h } = size.value;
    const t = time.value;
    const out = [];
    for (let i = 0; i < seeds.length; i += 2) {
      const sd = seeds[i];
      if (!sd) continue;
      const y = (((sd.y - t * sd.rise) % 1) + 1) % 1;
      out.push(vec(sd.x * w + Math.sin(t * 0.5 + sd.phase) * sd.drift, y * h));
    }
    return out;
  });
  const large = useDerivedValue(() => {
    const { w, h } = size.value;
    const t = time.value;
    const out = [];
    for (let i = 1; i < seeds.length; i += 2) {
      const sd = seeds[i];
      if (!sd) continue;
      const y = (((sd.y - t * sd.rise) % 1) + 1) % 1;
      out.push(vec(sd.x * w + Math.sin(t * 0.5 + sd.phase) * sd.drift, y * h));
    }
    return out;
  });

  const onLayout = (e: LayoutChangeEvent) => {
    size.set({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      className={className}
      style={StyleSheet.absoluteFill}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Points
          points={small}
          mode="points"
          color={withAlpha(tint, 0.35)}
          strokeWidth={3}
          strokeCap="round"
        />
        <Points
          points={large}
          mode="points"
          color={withAlpha(tint, 0.22)}
          strokeWidth={6}
          strokeCap="round"
        />
      </Canvas>
    </View>
  );
}
