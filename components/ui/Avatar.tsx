import { Image, Text as RNText, View } from 'react-native';

export interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

/** Up to two initials from the first and last word of the name, e.g. "Asha Verma" → "AV". */
function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const dimensions = { width: size, height: size, borderRadius: size / 2 };
  const trimmedUri = uri?.trim();

  if (trimmedUri) {
    return (
      <Image
        accessibilityRole="image"
        accessibilityLabel={name}
        source={{ uri: trimmedUri }}
        style={dimensions}
        className="bg-surface-muted"
      />
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name}
      style={dimensions}
      className="items-center justify-center bg-primary/15"
    >
      <RNText style={{ fontSize: Math.round(size * 0.4) }} className="font-semibold text-primary">
        {initialsFor(name)}
      </RNText>
    </View>
  );
}
