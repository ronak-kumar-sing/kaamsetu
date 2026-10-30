import { Stack } from 'expo-router';

import { useNavColors } from '@/features/profiles/components/navTheme';

export default function AuthLayout() {
  const colors = useNavColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.active,
        headerTitleStyle: { color: colors.foreground },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="phone" options={{ headerShown: true, title: '' }} />
      <Stack.Screen name="email" options={{ headerShown: true, title: '' }} />
      <Stack.Screen name="otp" options={{ headerShown: true, title: '' }} />
    </Stack>
  );
}
