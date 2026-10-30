import { Stack } from 'expo-router';

import { useNavColors } from '@/features/profiles/components/navTheme';

export default function OnboardingLayout() {
  const colors = useNavColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.active,
        headerTitleStyle: { color: colors.foreground },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="roles" options={{ title: 'Step 1 of 2', headerBackVisible: false }} />
      <Stack.Screen name="profile" options={{ title: 'Step 2 of 2' }} />
    </Stack>
  );
}
