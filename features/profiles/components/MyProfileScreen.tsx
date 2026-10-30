import { router } from 'expo-router';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListItem,
  Screen,
  Skeleton,
  Text,
} from '@/components/ui';
import { avatarUrl, useMyProfile, type Profile } from '@/features/profiles/api';

const VERIFICATIONS: readonly {
  key: 'phone_verified' | 'email_verified' | 'kyc_verified' | 'portfolio_verified';
  label: string;
}[] = [
  { key: 'phone_verified', label: 'Phone verified' },
  { key: 'email_verified', label: 'Email verified' },
  { key: 'kyc_verified', label: 'KYC verified' },
  { key: 'portfolio_verified', label: 'Portfolio verified' },
];

function ProfileSkeleton() {
  return (
    <View className="gap-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-24" />
      <Skeleton className="h-28" />
    </View>
  );
}

function ProfileContent({ profile }: { profile: Profile }) {
  const name = profile.full_name?.trim() || 'Your name';
  return (
    <View className="gap-4">
      <Card className="items-center gap-3">
        <Avatar uri={avatarUrl(profile.avatar_path)} name={name} size={80} />
        <View className="items-center gap-1">
          <Text variant="heading" className="text-center">
            {name}
          </Text>
          {profile.headline ? (
            <Text variant="body" tone="muted" className="text-center">
              {profile.headline}
            </Text>
          ) : null}
          {profile.city ? <Text variant="caption">{profile.city}</Text> : null}
        </View>
        <Button
          title="Edit profile"
          variant="outline"
          onPress={() => router.push('/edit-profile')}
          accessibilityHint="Opens the profile editor"
        />
      </Card>

      <Card className="gap-3">
        <Text variant="subheading">Verification</Text>
        <View className="flex-row flex-wrap gap-2">
          {VERIFICATIONS.map(({ key, label }) =>
            profile[key] ? (
              <Badge key={key} label={label} tone="success" />
            ) : (
              <Badge
                key={key}
                label={`${label.replace(' verified', '')}: Not verified`}
                tone="neutral"
              />
            ),
          )}
        </View>
      </Card>

      <Card className="p-0">
        <ListItem
          title="Settings"
          subtitle="Mode, email and account"
          onPress={() => router.push('/settings')}
        />
      </Card>
    </View>
  );
}

/** "My profile" tab shared by the client and freelancer modes. */
export function MyProfileScreen() {
  const profile = useMyProfile();

  return (
    <Screen scroll edges={[]}>
      {profile.isPending ? (
        <ProfileSkeleton />
      ) : profile.isError ? (
        <ErrorState
          message="We couldn't load your profile."
          onRetry={() => void profile.refetch()}
        />
      ) : profile.data ? (
        <ProfileContent profile={profile.data} />
      ) : (
        <EmptyState
          title="No profile yet"
          description="Finish setting up your profile to get started."
          actionLabel="Edit profile"
          onAction={() => router.push('/edit-profile')}
        />
      )}
    </Screen>
  );
}
