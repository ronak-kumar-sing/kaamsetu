import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  ListItem,
  Screen,
  Skeleton,
  Text,
} from '@/components/ui';
import { signOut } from '@/features/auth/api';
import { LinkEmailCard } from '@/features/auth/components/LinkEmailCard';
import { useAuthStore } from '@/features/auth/store';
import { MODE_HOME, MODE_LABEL, resolveMode } from '@/features/navigation/mode';
import { useMyProfile, useMyRoles, useSetMyRoles } from '@/features/profiles/api';
import { SELF_ASSIGNABLE_ROLES, type AppRole, type SelfAssignableRole } from '@/shared/constants';

const ROLE_NOUN: Record<SelfAssignableRole, string> = {
  client: 'hiring (client)',
  freelancer: 'working (freelancer)',
};

export default function SettingsScreen() {
  const profile = useMyProfile();
  const roles = useMyRoles();
  const setRoles = useSetMyRoles();
  const activeMode = useAuthStore((s) => s.activeMode);
  const [signingOut, setSigningOut] = useState(false);

  if (profile.isPending || roles.isPending) {
    return (
      <Screen edges={['bottom']}>
        <View className="gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-16" />
        </View>
      </Screen>
    );
  }
  if (profile.isError || roles.isError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message="We couldn't load your settings."
          onRetry={() => {
            void profile.refetch();
            void roles.refetch();
          }}
        />
      </Screen>
    );
  }

  const myRoles = roles.data;
  const currentMode = resolveMode(myRoles, activeMode);
  const missingRoles = SELF_ASSIGNABLE_ROLES.filter((role) => !myRoles.includes(role));
  const emailVerified = profile.data?.email_verified ?? false;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const switchMode = (mode: AppRole) => {
    useAuthStore.getState().setActiveMode(mode);
    router.replace(MODE_HOME[mode]);
  };

  const addRole = async (role: SelfAssignableRole) => {
    if (setRoles.isPending) return;
    const current = myRoles.filter((r): r is SelfAssignableRole => r !== 'admin');
    try {
      await setRoles.mutateAsync([...current, role]);
    } catch {
      // Surfaced via setRoles.error below.
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to verify your phone or email to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          signOut().finally(() => setSigningOut(false));
        },
      },
    ]);
  };

  return (
    <Screen scroll edges={['bottom']}>
      <View className="gap-5">
        {myRoles.length > 1 ? (
          <Card className="gap-1 p-0">
            <Text variant="subheading" className="px-4 pt-4">
              Switch mode
            </Text>
            {myRoles.map((role) => (
              <ListItem
                key={role}
                title={MODE_LABEL[role]}
                right={role === currentMode ? <Badge label="Current" tone="primary" /> : undefined}
                onPress={() => switchMode(role)}
              />
            ))}
          </Card>
        ) : null}

        {missingRoles.length > 0 ? (
          <Card className="gap-3">
            <Text variant="subheading">Add a role</Text>
            {missingRoles.map((role) => (
              <Button
                key={role}
                title={role === 'client' ? 'Start hiring' : 'Start working'}
                variant="outline"
                loading={setRoles.isPending}
                accessibilityHint={`Adds ${ROLE_NOUN[role]} to your account`}
                onPress={() => void addRole(role)}
              />
            ))}
            {setRoles.isError ? (
              <Banner tone="danger" title="Couldn't add the role" message="Please try again." />
            ) : null}
          </Card>
        ) : null}

        {emailVerified ? (
          <Card className="flex-row items-center justify-between">
            <Text variant="subheading">Email</Text>
            <Badge label="Email verified" tone="success" />
          </Card>
        ) : (
          <LinkEmailCard />
        )}

        <Card className="flex-row items-center justify-between">
          <Text variant="body">App version</Text>
          <Text variant="body" tone="muted">
            {version}
          </Text>
        </Card>

        <Button
          title="Sign out"
          variant="danger"
          size="lg"
          fullWidth
          loading={signingOut}
          onPress={confirmSignOut}
        />
      </View>
    </Screen>
  );
}
