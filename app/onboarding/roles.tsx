import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Banner,
  Button,
  ErrorState,
  Screen,
  SelectableCard,
  Skeleton,
  Text,
} from '@/components/ui';
import { useMyRoles, useSetMyRoles } from '@/features/profiles/api';
import { SELF_ASSIGNABLE_ROLES, type SelfAssignableRole } from '@/shared/constants';

const OPTIONS: readonly { role: SelfAssignableRole; title: string; description: string }[] = [
  {
    role: 'client',
    title: 'I want to hire',
    description: 'Post projects and pay freelancers through escrow.',
  },
  {
    role: 'freelancer',
    title: 'I want to work',
    description: 'Find projects and get paid milestone by milestone.',
  },
];

export default function OnboardingRolesScreen() {
  const roles = useMyRoles();
  const setRoles = useSetMyRoles();
  // null until the user touches a card, so the stored roles pre-select without an effect.
  const [picked, setPicked] = useState<SelfAssignableRole[] | null>(null);

  if (roles.isPending) {
    return (
      <Screen>
        <View className="gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </View>
      </Screen>
    );
  }
  if (roles.isError) {
    return (
      <Screen>
        <ErrorState message="We couldn't load your account." onRetry={() => void roles.refetch()} />
      </Screen>
    );
  }

  const stored = roles.data.filter((r): r is SelfAssignableRole =>
    (SELF_ASSIGNABLE_ROLES as readonly string[]).includes(r),
  );
  const selected = picked ?? stored;

  const toggle = (role: SelfAssignableRole) =>
    setPicked(selected.includes(role) ? selected.filter((r) => r !== role) : [...selected, role]);

  const onContinue = async () => {
    if (selected.length === 0 || setRoles.isPending) return;
    try {
      await setRoles.mutateAsync(selected);
      router.push('/onboarding/profile');
    } catch {
      // Surfaced via setRoles.error below.
    }
  };

  return (
    <Screen scroll>
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="title">How will you use KaamSetu?</Text>
          <Text variant="body" tone="muted">
            Pick one or both. You can add the other later from Settings.
          </Text>
        </View>

        <View className="gap-3">
          {OPTIONS.map((option) => (
            <SelectableCard
              key={option.role}
              title={option.title}
              description={option.description}
              selected={selected.includes(option.role)}
              onToggle={() => {
                if (!setRoles.isPending) toggle(option.role);
              }}
            />
          ))}
        </View>

        {setRoles.isError ? (
          <Banner tone="danger" title="Couldn't save your choice" message="Please try again." />
        ) : null}

        <Button
          title="Continue"
          size="lg"
          fullWidth
          loading={setRoles.isPending}
          disabled={selected.length === 0}
          onPress={() => void onContinue()}
        />
      </View>
    </Screen>
  );
}
