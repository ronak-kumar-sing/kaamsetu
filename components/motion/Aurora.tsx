// Native port inspired by React Bits Aurora (https://reactbits.dev) — MIT + Commons Clause.
import { useMemo } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Fill, LinearGradient, Shader, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useMotionClock } from './useMotionClock';
import { useMotionPalette, withAlpha } from './palette';

export interface AuroraProps {
  /** Three #RRGGBB colours blended left to right. Defaults to teal tones. */
  colorStops?: [string, string, string];
  /** Wave height, 0-2. Default 1. */
  amplitude?: number;
  /** Animation speed multiplier. Default 1. */
  speed?: number;
  /** Edge softness, 0-1. Default 0.5. */
  blend?: number;
  paused?: boolean;
  className?: string;
}

// SkSL port of the React Bits Aurora fragment shader (simplex noise replaced by value noise).
const SOURCE = `
uniform float2 resolution;
uniform float time;
uniform float amplitude;
uniform float blend;
uniform half3 c0;
uniform half3 c1;
uniform half3 c2;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

half4 main(float2 fragCoord) {
  float2 uv = float2(fragCoord.x / resolution.x, 1.0 - fragCoord.y / resolution.y);
  half3 ramp;
  if (uv.x < 0.5) {
    ramp = mix(c0, c1, half(uv.x * 2.0));
  } else {
    ramp = mix(c1, c2, half((uv.x - 0.5) * 2.0));
  }
  float height = noise(float2(uv.x * 2.0 + time * 0.1, time * 0.25)) * 0.5 * amplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;
  float mid = 0.2;
  float alpha = smoothstep(mid - blend * 0.5, mid + blend * 0.5, intensity);
  half3 rgb = ramp * half(intensity) * half(alpha);
  return half4(rgb, half(alpha));
}
`;

const effect = Skia.RuntimeEffect.Make(SOURCE);

function rgb(hex: string): number[] {
  const c = Skia.Color(hex);
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
}

/** Full-bleed animated aurora background. Decorative: ignores touches and is hidden from a11y. */
export function Aurora({
  colorStops,
  amplitude = 1,
  speed = 1,
  blend = 0.5,
  paused = false,
  className,
}: AuroraProps) {
  const palette = useMotionPalette();
  const stops = useMemo<[string, string, string]>(
    () => colorStops ?? [palette.primary, '#38BDF8', palette.primary],
    [colorStops, palette.primary],
  );
  const size = useSharedValue({ w: 1, h: 1 });
  const time = useMotionClock(paused, speed);
  const [a, b, c] = useMemo(() => [rgb(stops[0]), rgb(stops[1]), rgb(stops[2])], [stops]);

  const uniforms = useDerivedValue(() => ({
    resolution: [size.value.w, size.value.h],
    time: time.value,
    amplitude,
    blend,
    c0: a ?? [0, 0, 0],
    c1: b ?? [0, 0, 0],
    c2: c ?? [0, 0, 0],
  }));

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
        <Fill>
          {effect ? (
            <Shader source={effect} uniforms={uniforms} />
          ) : (
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, 600)}
              colors={[withAlpha(stops[0], 0.35), withAlpha(stops[2], 0)]}
            />
          )}
        </Fill>
      </Canvas>
    </View>
  );
}
