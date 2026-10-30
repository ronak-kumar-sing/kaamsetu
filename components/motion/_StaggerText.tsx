// Shared internals for BlurText and SplitText (native ports inspired by React Bits, https://reactbits.dev — MIT + Commons Clause).
import { useEffect, useMemo } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotionPalette } from './palette';

export interface StaggerTextBaseProps {
  text: string;
  /** Delay between pieces in ms. */
  delay?: number;
  /** 'top' pieces fall in from above, 'bottom' rise from below. */
  direction?: 'top' | 'bottom';
  color?: string;
  className?: string;
  textClassName?: string;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}

interface StaggerTextProps extends StaggerTextBaseProps {
  unit: 'words' | 'letters';
  motion: 'timing' | 'spring';
  distance: number;
  startScale: number;
}

interface PieceProps {
  value: string;
  order: number;
  delay: number;
  sign: 1 | -1;
  motion: 'timing' | 'spring';
  distance: number;
  startScale: number;
  reduced: boolean;
  color: string;
  className?: string;
  textStyle?: StyleProp<TextStyle>;
}

function Piece({
  value,
  order,
  delay,
  sign,
  motion,
  distance,
  startScale,
  reduced,
  color,
  className,
  textStyle,
}: PieceProps) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      p.value = 1;
      return;
    }
    p.value = withDelay(
      order * delay,
      motion === 'spring'
        ? withSpring(1, { damping: 14, stiffness: 140, mass: 0.8 })
        : withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
  }, [reduced, order, delay, motion, p]);
  const animated = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: Math.min(1, Math.max(0, t)),
      transform: [
        { translateY: sign * distance * (1 - t) },
        { scale: startScale + (1 - startScale) * t },
      ],
    };
  });
  return (
    <Animated.Text className={className} style={[{ color }, textStyle, animated]}>
      {value}
    </Animated.Text>
  );
}

const DEFAULT_TEXT_STYLE: TextStyle = { fontSize: 28, lineHeight: 36, fontWeight: '700' };

export function StaggerText({
  text,
  unit,
  motion,
  distance,
  startScale,
  delay = 80,
  direction = 'bottom',
  color,
  className,
  textClassName,
  textStyle,
  style,
}: StaggerTextProps) {
  const reduced = useReducedMotion();
  const palette = useMotionPalette();
  const words = useMemo(() => text.split(/\s+/).filter((w) => w.length > 0), [text]);
  const sign: 1 | -1 = direction === 'top' ? -1 : 1;
  const resolvedColor = color ?? palette.foreground;
  const merged = [DEFAULT_TEXT_STYLE, textStyle];

  let order = 0;
  return (
    <View
      accessible
      accessibilityLabel={text}
      accessibilityRole="text"
      className={className}
      style={[{ flexDirection: 'row', flexWrap: 'wrap' }, style]}
    >
      {words.map((word, wi) => {
        const pieces = unit === 'words' ? [word] : Array.from(word);
        return (
          <View
            key={`${wi}-${word}`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexDirection: 'row' }}
          >
            {pieces.map((piece, pi) => (
              <Piece
                key={pi}
                value={piece}
                order={order++}
                delay={delay}
                sign={sign}
                motion={motion}
                distance={distance}
                startScale={startScale}
                reduced={reduced}
                color={resolvedColor}
                className={textClassName}
                textStyle={merged}
              />
            ))}
            {wi < words.length - 1 ? (
              <Animated.Text style={[merged, { color: resolvedColor }]}> </Animated.Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
