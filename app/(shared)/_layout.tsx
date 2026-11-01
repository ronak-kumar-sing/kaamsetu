import { Stack } from 'expo-router';

import { useNavColors } from '@/features/profiles/components/navTheme';

export default function SharedLayout() {
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
      <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
      <Stack.Screen name="milestone/[id]" options={{ title: 'Milestone' }} />
      <Stack.Screen name="profile/[id]" options={{ title: 'Profile' }} />
      <Stack.Screen name="invite/[token]" options={{ title: 'Invitation' }} />
      <Stack.Screen name="proposal/new" options={{ title: 'Send a proposal' }} />
    </Stack>
  );
}
