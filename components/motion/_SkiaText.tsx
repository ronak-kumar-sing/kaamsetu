// Shared internals for ShinyText and GradientText (native ports inspired by React Bits, https://reactbits.dev — MIT + Commons Clause).
import { useMemo, type ReactElement } from 'react';
import { Platform, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { Canvas, matchFont, Text as SkiaTextNode, type SkFont } from '@shopify/react-native-skia';

export type SkiaFontWeight = 'normal' | 'bold' | '500' | '600' | '700';

export interface SkiaTextBaseProps {
  text: string;
  fontSize?: number;
  fontWeight?: SkiaFontWeight;
  className?: string;
}

function useSystemFont(fontSize: number, fontWeight: SkiaFontWeight): SkFont | null {
  return useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
        fontSize,
        fontWeight,
      }) ?? null,
    [fontSize, fontWeight],
  );
}

interface SkiaGradientTextProps extends SkiaTextBaseProps {
  fallbackColor: string;
  reduced: boolean;
  /** Renders the shader node as a child of the Skia Text; receives the text width. */
  renderShader: (width: number) => ReactElement;
}

/** Skia-drawn text with a shader fill; falls back to plain RN Text when no font or reduced motion. */
export function SkiaGradientText({
  text,
  fontSize = 28,
  fontWeight = 'bold',
  className,
  fallbackColor,
  reduced,
  renderShader,
}: SkiaGradientTextProps) {
  const font = useSystemFont(fontSize, fontWeight);
  if (reduced || !font) {
    const style: StyleProp<TextStyle> = { fontSize, fontWeight, color: fallbackColor };
    return (
      <Text accessibilityRole="text" className={className} style={style}>
        {text}
      </Text>
    );
  }
  const width = Math.ceil(font.getTextWidth(text)) + 2;
  const height = Math.ceil(fontSize * 1.3);
  return (
    <View
      accessible
      accessibilityLabel={text}
      accessibilityRole="text"
      className={className}
      style={{ width, height }}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width, height }}
      >
        <Canvas style={{ width, height }}>
          <SkiaTextNode x={0} y={fontSize} text={text} font={font}>
            {renderShader(width)}
          </SkiaTextNode>
        </Canvas>
      </View>
    </View>
  );
}
