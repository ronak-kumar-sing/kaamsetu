import { View } from 'react-native';

import { ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import {
  useCompleteOnboarding,
  useMyProfile,
  useMyRoles,
  useSaveProfileSetup,
} from '@/features/profiles/api';
import {
  ProfileForm,
  profileToFormInput,
  type ProfileFormValues,
} from '@/features/profiles/components/ProfileForm';

export default function OnboardingProfileScreen() {
  const profile = useMyProfile();
  const roles = useMyRoles();
  const save = useSaveProfileSetup();
  const complete = useCompleteOnboarding();

  if (profile.isPending || roles.isPending) {
    return (
      <Screen>
        <View className="gap-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-24" />
        </View>
      </Screen>
    );
  }
  if (profile.isError || roles.isError) {
    return (
      <Screen>
        <ErrorState
          message="We couldn't load your profile."
          onRetry={() => {
            void profile.refetch();
            void roles.refetch();
          }}
        />
      </Screen>
    );
  }

  const firstRole = roles.data.includes('client') ? 'client' : 'freelancer';
  const error = save.error ?? complete.error;

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await save.mutateAsync(values);
      useAuthStore.getState().setActiveMode(firstRole);
      await complete.mutateAsync();
      // The root guard moves the user into the app once onboarding_completed_at is set.
    } catch {
      // Surfaced via errorMessage below.
    }
  };

  return (
    <Screen scroll>
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="title">Set up your profile</Text>
          <Text variant="body" tone="muted">
            This is what people see when you work together.
          </Text>
        </View>
        <ProfileForm
          defaultValues={profileToFormInput(profile.data)}
          submitLabel="Finish"
          onSubmit={onSubmit}
          errorMessage={error ? 'Something went wrong while saving. Please try again.' : undefined}
          footer={
            <Text variant="caption" className="text-center">
              You can verify your ID (KYC) later from your profile to earn a Verified badge.
            </Text>
          }
        />
      </View>
    </Screen>
  );
}
