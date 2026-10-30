import { useEffect } from 'react';
import { useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

/**
 * UI-thread clock in seconds. Advances by `speed` per second while active; frozen when paused
 * or when the user prefers reduced motion. No JS-thread work per frame.
 */
export function useMotionClock(paused: boolean, speed = 1): SharedValue<number> {
  const reduced = useReducedMotion();
  const time = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame ?? 16;
    time.value += (Math.min(dt, 64) / 1000) * speed;
  }, false);
  const active = !paused && !reduced;
  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);
  return time;
}
