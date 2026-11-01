import { router } from 'expo-router';
import { View } from 'react-native';

import { Banner, Button, Card, Money, Skeleton, Text } from '@/components/ui';
import { rpcErrorMessage } from '@/features/projects/errors';
import { formatDate } from '@/features/projects/format';
import { routes } from '@/features/projects/routes';

import { useMyInvites, useRespondInvite } from '../api';

/** Pending invitations addressed to the signed-in freelancer, with accept/decline. */
export function MyInvitesSection() {
  const invites = useMyInvites();
  const respond = useRespondInvite();

  if (invites.isPending) return <Skeleton className="h-24" />;
  if (invites.isError) {
    return (
      <Banner
        tone="warning"
        title="Couldn't load invites"
        actionLabel="Retry"
        onAction={() => void invites.refetch()}
      />
    );
  }
  if (invites.data.length === 0) return null;

  const answer = async (inviteId: string, accept: boolean) => {
    if (respond.isPending) return;
    try {
      const projectId = await respond.mutateAsync({ inviteId, accept });
      if (accept) router.push(routes.project(projectId));
    } catch {
      // Surfaced through respond.error below.
    }
  };

  return (
    <View className="gap-3">
      <Text variant="heading">Invitations</Text>
      {respond.isError ? (
        <Banner tone="danger" title="Couldn't respond" message={rpcErrorMessage(respond.error)} />
      ) : null}
      {invites.data.map((invite) => {
        const pendingThis = respond.isPending && respond.variables?.inviteId === invite.id;
        return (
          <Card key={invite.id} className="gap-3">
            <Text variant="subheading">{invite.project?.title ?? 'A project'}</Text>
            <View className="flex-row items-center justify-between">
              {invite.project ? <Money paise={invite.project.total_paise} /> : <View />}
              <Text variant="caption">Expires {formatDate(invite.expires_at)}</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <Button
                title="View"
                size="sm"
                variant="ghost"
                disabled={!invite.project}
                onPress={() => invite.project && router.push(routes.project(invite.project.id))}
              />
              <Button
                title="Decline"
                size="sm"
                variant="outline"
                disabled={respond.isPending}
                onPress={() => void answer(invite.id, false)}
              />
              <Button
                title="Accept"
                size="sm"
                loading={pendingThis && respond.variables?.accept === true}
                disabled={respond.isPending}
                onPress={() => void answer(invite.id, true)}
              />
            </View>
          </Card>
        );
      })}
    </View>
  );
}
