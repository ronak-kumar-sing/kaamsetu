import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FadeContent } from '@/components/motion/FadeContent';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  ListItem,
  Money,
  Screen,
  Skeleton,
  Text,
} from '@/components/ui';
import { useCreateInvite } from '@/features/invites/api';
import { avatarUrl } from '@/features/profiles/api';
import { useMyOpenProjects, useUserId } from '@/features/projects/api';
import { BottomSheet } from '@/features/projects/components/BottomSheet';
import { rpcErrorMessage } from '@/features/projects/errors';
import { routes } from '@/features/projects/routes';

import { useProfileSkills, usePublicProfile } from '../api';
import { VerificationBadges } from './FreelancerCard';

export function PublicProfileView({ id }: { id: string }) {
  const userId = useUserId();
  const profile = usePublicProfile(id);
  const skills = useProfileSkills(id);
  const myProjects = useMyOpenProjects();
  const invite = useCreateInvite();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  if (profile.isPending) {
    return (
      <Screen edges={['bottom']}>
        <View className="gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </View>
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message={rpcErrorMessage(profile.error)}
          onRetry={() => void profile.refetch()}
        />
      </Screen>
    );
  }
  const data = profile.data;
  if (!data) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState title="Profile not found" message="This profile is unavailable." />
      </Screen>
    );
  }

  const name = data.full_name ?? 'Freelancer';
  const invitable = myProjects.data ?? [];
  const isMe = userId === data.id;

  const sendInvite = async (projectId: string, title: string) => {
    if (invite.isPending) return;
    setMessage(null);
    try {
      await invite.mutateAsync({ projectId, target: { kind: 'profile', freelancerId: data.id } });
      setPickerOpen(false);
      setMessage({ tone: 'success', text: `${name} has been invited to "${title}".` });
    } catch (e) {
      setPickerOpen(false);
      setMessage({ tone: 'danger', text: rpcErrorMessage(e) });
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <View className="gap-6">
        <FadeContent className="items-center gap-3">
          <Avatar uri={avatarUrl(data.avatar_path)} name={name} size={88} />
          <Text variant="title" className="text-center">
            {name}
          </Text>
          {data.headline ? (
            <Text variant="body" tone="muted" className="text-center">
              {data.headline}
            </Text>
          ) : null}
          {data.city ? <Text variant="caption">{data.city}</Text> : null}
          <VerificationBadges
            kyc={data.kyc_verified}
            portfolio={data.portfolio_verified}
            phone={data.phone_verified}
          />
        </FadeContent>

        {message ? (
          <Banner
            tone={message.tone}
            title={message.tone === 'success' ? 'Invite sent' : "Couldn't invite"}
            message={message.text}
          />
        ) : null}

        {data.hourly_rate_paise ? (
          <Card className="flex-row items-center justify-between">
            <Text variant="subheading">Hourly rate</Text>
            <Money paise={data.hourly_rate_paise} variant="heading" />
          </Card>
        ) : null}

        {data.bio ? (
          <View className="gap-2">
            <Text variant="heading">About</Text>
            <Text variant="body">{data.bio}</Text>
          </View>
        ) : null}

        {skills.data && skills.data.length > 0 ? (
          <View className="gap-2">
            <Text variant="heading">Skills</Text>
            <View className="flex-row flex-wrap gap-2">
              {skills.data.map((s) => (
                <Badge key={s.id} label={s.name} tone="primary" />
              ))}
            </View>
          </View>
        ) : null}

        {data.languages.length > 0 ? (
          <Text variant="caption">Speaks {data.languages.join(', ')}</Text>
        ) : null}

        {!isMe ? (
          <Button
            title="Invite to a project"
            onPress={() => setPickerOpen(true)}
            accessibilityHint="Choose one of your open projects"
          />
        ) : null}
      </View>

      <BottomSheet
        visible={pickerOpen}
        title="Invite to which project?"
        onClose={() => setPickerOpen(false)}
      >
        {myProjects.isPending ? (
          <Skeleton className="h-16" />
        ) : myProjects.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load your projects"
            actionLabel="Retry"
            onAction={() => void myProjects.refetch()}
          />
        ) : invitable.length === 0 ? (
          <View className="gap-3">
            <Text variant="body">
              Invites work on open projects. Publish a project, then invite {name}.
            </Text>
            <Button
              title="Post a project"
              onPress={() => {
                setPickerOpen(false);
                router.push(routes.postProject);
              }}
            />
          </View>
        ) : (
          <View>
            {invitable.map((p) => (
              <ListItem
                key={p.id}
                title={p.title}
                subtitle="Open"
                onPress={() => void sendInvite(p.id, p.title)}
              />
            ))}
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}
