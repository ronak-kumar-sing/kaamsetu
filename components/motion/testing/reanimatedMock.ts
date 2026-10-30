// Minimal JS-only stand-in for react-native-reanimated, used by Jest tests (the real module needs
// a custom resolver + native runtime). Animations resolve instantly; shared values are plain refs.
import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';

interface Shared<T> {
  value: T;
  get: () => T;
  set: (v: T) => void;
}

function makeShared<T>(initial: T): Shared<T> {
  const s: Shared<T> = {
    value: initial,
    get: () => s.value,
    set: (v) => {
      s.value = v;
    },
  };
  return s;
}

// A chainable layout-animation builder: every method returns the builder itself.
const builder: object = new Proxy({}, { get: () => (): object => builder });

const passthrough = <T>(v: T): T => v;

export const useReducedMotion = (): boolean => false;
export const useSharedValue = <T>(initial: T): Shared<T> => useState(() => makeShared(initial))[0];
export const useDerivedValue = <T>(fn: () => T): Shared<T> => makeShared(fn());
export const useAnimatedStyle = (fn: () => object): object => fn();
export const useAnimatedProps = (fn: () => object): object => fn();
export const useAnimatedReaction = (): void => undefined;
export const useFrameCallback = (): { setActive: (a: boolean) => void } => ({
  setActive: () => undefined,
});
export const withTiming = passthrough;
export const withSpring = passthrough;
export const withDelay = (_d: number, v: unknown): unknown => v;
export const withRepeat = passthrough;
export const withSequence = (...v: unknown[]): unknown => v[v.length - 1];
export const Easing = new Proxy({}, { get: () => () => undefined });
export const FadeIn = builder;
export const FadeInDown = builder;
export const FadeInUp = builder;
export const FadeInLeft = builder;
export const FadeInRight = builder;
export const LinearTransition = builder;

const Animated = {
  View,
  Text,
  FlatList,
  createAnimatedComponent: <T>(c: T): T => c,
};
export default Animated;
