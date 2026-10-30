import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Aurora, BlurText, FadeContent } from '@/components/motion';
import { Button, Screen, Text } from '@/components/ui';
import { useNavColors } from '@/features/profiles/components/navTheme';

type IconName = keyof typeof Ionicons.glyphMap;

const TRUST_POINTS: readonly { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'lock-closed-outline',
    title: 'Escrow protection',
    body: 'Your money is held safely and released milestone by milestone.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Verified profiles',
    body: 'Phone, email and ID checks so you know who you work with.',
  },
  {
    icon: 'document-text-outline',
    title: 'Signed agreements',
    body: 'Every project starts with a clear, signed agreement.',
  },
];

export default function WelcomeScreen() {
  const colors = useNavColors();
  return (
    <View className="flex-1 bg-background">
      <View className="absolute inset-x-0 top-0 h-80 opacity-60">
        <Aurora amplitude={0.8} speed={0.6} />
      </View>
      <Screen scroll transparent contentClassName="justify-between gap-8">
        <View className="gap-3 pt-8">
          <Text variant="title" tone="primary">
            KaamSetu
          </Text>
          <BlurText
            text="Milestone payments held safely until work is delivered"
            animateBy="words"
            delay={80}
            textClassName="text-xl font-semibold text-foreground"
          />
        </View>

        <View className="gap-5">
          {TRUST_POINTS.map((point, i) => (
            <FadeContent
              key={point.title}
              direction="up"
              delay={500 + i * 120}
              className="flex-row items-start gap-3"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <Ionicons name={point.icon} size={20} color={colors.active} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="subheading">{point.title}</Text>
                <Text variant="caption">{point.body}</Text>
              </View>
            </FadeContent>
          ))}
        </View>

        <View className="gap-3">
          <Button
            title="Continue with phone"
            size="lg"
            fullWidth
            onPress={() => router.push('/phone')}
          />
          <Button
            title="Use email instead"
            variant="ghost"
            size="lg"
            fullWidth
            onPress={() => router.push('/email')}
          />
        </View>
      </Screen>
    </View>
  );
}
