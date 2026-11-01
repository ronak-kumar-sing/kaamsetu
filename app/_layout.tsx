import '../global.css';
import '@/lib/logbox';

import { QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, ErrorState, LoadingState, Screen } from '@/components/ui';
import { signOut } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/store';
import { useAuthListener } from '@/features/auth/useAuthListener';
import { useMyProfile, useMyRoles } from '@/features/profiles/api';
import { queryClient } from '@/lib/queryClient';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  useAuthListener();
  const initialized = useAuthStore((s) => s.initialized);
  const isSignedIn = useAuthStore((s) => !!s.session);
  const profile = useMyProfile();
  const roles = useMyRoles();

  const loadingAccount = isSignedIn && (profile.isPending || roles.isPending);
  const ready = initialized && !loadingAccount;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // A stored session whose user no longer exists (account deleted, local DB reset) has no
  // profile row. Treat it as signed out instead of stranding the user in onboarding.
  const orphanedSession = isSignedIn && profile.isSuccess && profile.data === null;
  useEffect(() => {
    if (orphanedSession) void signOut();
  }, [orphanedSession]);

  if (!ready || orphanedSession) return <LoadingState />;

  // Only block the app when there is nothing cached; a failed background refetch keeps the
  // last good data on screen.
  const accountMissing = (profile.isError && !profile.data) || (roles.isError && !roles.data);
  if (isSignedIn && accountMissing) {
    return (
      <Screen>
        <ErrorState
          message="We couldn't load your account."
          onRetry={() => {
            void profile.refetch();
            void roles.refetch();
          }}
        />
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </Screen>
    );
  }

  const onboarded = !!profile.data?.onboarding_completed_at;
  const isAdmin = roles.data?.includes('admin') ?? false;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Unguarded entry point: redirects to the right place for the current auth state. */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && onboarded}>
        <Stack.Screen name="client" />
        <Stack.Screen name="freelancer" />
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="admin" />
        </Stack.Protected>
        <Stack.Screen name="(shared)" />
      </Stack.Protected>
    </Stack>
  );
}
