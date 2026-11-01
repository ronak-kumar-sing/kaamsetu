import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FadeContent } from '@/components/motion/FadeContent';
import { Banner, Button, Card, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { rpcErrorMessage } from '@/features/projects/errors';
import { routes } from '@/features/projects/routes';

import { useRespondInvite, useResolveInvite } from '../api';

/** Landing screen for kaamsetu://invite/<token>: shows the project and lets the invitee answer. */
export function InviteLanding({ token }: { token: string }) {
  const resolved = useResolveInvite(token);
  const respond = useRespondInvite();
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  if (resolved.isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton className="h-40" />
      </Screen>
    );
  }
  if (resolved.isError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message={rpcErrorMessage(resolved.error)}
          onRetry={() => void resolved.refetch()}
        />
      </Screen>
    );
  }
  const invite = resolved.data;
  if (!invite) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          title="Invite not found"
          message={rpcErrorMessage({ message: 'invite_invalid' })}
        />
        <Button title="Go home" variant="outline" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const answer = async (accept: boolean) => {
    if (respond.isPending) return;
    setError(null);
    try {
      const projectId = await respond.mutateAsync({ token, accept });
      if (accept) router.replace(routes.project(projectId));
      else setDeclined(true);
    } catch (e) {
      setError(rpcErrorMessage(e));
    }
  };

  const actionable = invite.status === 'pending' && !declined;

  return (
    <Screen scroll edges={['bottom']}>
      <FadeContent className="gap-6">
        <View className="gap-2">
          <Text variant="label" tone="muted">
            You&apos;re invited
          </Text>
          <Text variant="title">{invite.project_title}</Text>
          <Text variant="body" tone="muted">
            {invite.client_name ? `${invite.client_name} invited you` : 'A client invited you'} to
            send a proposal for this project.
          </Text>
        </View>

        {error ? <Banner tone="danger" title="Couldn't respond" message={error} /> : null}
        {declined ? <Banner tone="info" title="Invite declined" /> : null}
        {!actionable && !declined ? (
          <Banner
            tone="warning"
            title={`This invite is ${invite.status}`}
            message="Ask the client to send a new one if you still want to work on it."
          />
        ) : null}

        {actionable ? (
          <Card className="gap-3">
            <Button
              title="Accept invite"
              loading={respond.isPending && respond.variables?.accept === true}
              disabled={respond.isPending}
              onPress={() => void answer(true)}
            />
            <Button
              title="Decline"
              variant="outline"
              loading={respond.isPending && respond.variables?.accept === false}
              disabled={respond.isPending}
              onPress={() => void answer(false)}
            />
          </Card>
        ) : (
          <Button title="Go home" variant="outline" onPress={() => router.replace('/')} />
        )}
      </FadeContent>
    </Screen>
  );
}
