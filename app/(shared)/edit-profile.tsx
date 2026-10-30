import { router } from 'expo-router';
import { View } from 'react-native';

import { ErrorState, Screen, Skeleton } from '@/components/ui';
import { useMyProfile, useMyRoles, useUpdateMyProfile } from '@/features/profiles/api';
import {
  ProfileForm,
  profileToFormInput,
  type ProfileFormValues,
} from '@/features/profiles/components/ProfileForm';

export default function EditProfileScreen() {
  const profile = useMyProfile();
  const roles = useMyRoles();
  const update = useUpdateMyProfile();

  if (profile.isPending || roles.isPending) {
    return (
      <Screen edges={['bottom']}>
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
      <Screen edges={['bottom']}>
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

  const isFreelancer = roles.data.includes('freelancer');

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await update.mutateAsync({
        full_name: values.full_name,
        city: values.city,
        headline: values.headline || null,
        bio: values.bio || null,
        languages: values.languages,
        ...(isFreelancer
          ? { hourly_rate_paise: values.hourly_rate_paise, availability: values.availability }
          : {}),
      });
      router.back();
    } catch {
      // Surfaced via errorMessage below.
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <ProfileForm
        defaultValues={profileToFormInput(profile.data)}
        submitLabel="Save changes"
        showFreelancerFields={isFreelancer}
        onSubmit={onSubmit}
        errorMessage={
          update.isError ? 'Something went wrong while saving. Please try again.' : undefined
        }
      />
    </Screen>
  );
}
