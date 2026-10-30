// Native port inspired by React Bits AnimatedList (https://reactbits.dev) — MIT + Commons Clause.
import type { ReactElement } from 'react';
import { type FlatListProps, type ListRenderItemInfo } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

export interface AnimatedListProps<T> extends Omit<
  FlatListProps<T>,
  'renderItem' | 'keyExtractor' | 'data'
> {
  data: readonly T[];
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null;
  keyExtractor: (item: T, index: number) => string;
  /** Delay between consecutive items in ms. Default 60. */
  stagger?: number;
  /** Only the first N items animate in (keeps long lists cheap). Default 12. */
  maxAnimated?: number;
}

/** FlatList whose rows fade in with a stagger and re-flow smoothly on insert/remove. */
export function AnimatedList<T>({
  data,
  renderItem,
  keyExtractor,
  stagger = 60,
  maxAnimated = 12,
  ...rest
}: AnimatedListProps<T>) {
  const reduced = useReducedMotion();
  const FlatList = Animated.FlatList as unknown as (
    props: FlatListProps<T> & { itemLayoutAnimation?: typeof LinearTransition },
  ) => ReactElement;
  return (
    <FlatList
      {...rest}
      data={data}
      keyExtractor={keyExtractor}
      itemLayoutAnimation={reduced ? undefined : LinearTransition}
      renderItem={(info) => {
        const content = renderItem(info);
        if (reduced || info.index >= maxAnimated) return content as ReactElement;
        return (
          <Animated.View entering={FadeInDown.delay(info.index * stagger).duration(420)}>
            {content}
          </Animated.View>
        );
      }}
    />
  );
}
