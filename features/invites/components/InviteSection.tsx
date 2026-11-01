import { router } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import {
  Badge,
  Banner,
  Button,
  Card,
  Input,
  Skeleton,
  Text,
  type BadgeTone,
} from '@/components/ui';
import { usePublicProfiles } from '@/features/freelancers/api';
import { rpcErrorMessage } from '@/features/projects/errors';
import { formatDate } from '@/features/projects/format';
import { indianMobileSchema } from '@/shared/schemas/identity';

import {
  inviteLink,
  useCreateInvite,
  useProjectInvites,
  useRevokeInvite,
  type Invite,
  type InviteStatus,
} from '../api';

const STATUS_TONE: Record<InviteStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'neutral',
  revoked: 'neutral',
  expired: 'neutral',
};
const STATUS_LABEL: Record<InviteStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  revoked: 'Revoked',
  expired: 'Expired',
};

export interface InviteSectionProps {
  projectId: string;
  projectTitle: string;
}

export function InviteSection({ projectId, projectTitle }: InviteSectionProps) {
  const invites = useProjectInvites(projectId);
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const people = usePublicProfiles(
    (invites.data ?? []).flatMap((i) => (i.freelancer_id ? [i.freelancer_id] : [])),
  );

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const invitePhone = async () => {
    if (create.isPending) return;
    const parsed = indianMobileSchema.safeParse(phone);
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0]?.message ?? 'Enter a valid mobile number');
      return;
    }
    setPhoneError(undefined);
    setMessage(null);
    try {
      await create.mutateAsync({ projectId, target: { kind: 'phone', phone: parsed.data } });
      setPhone('');
      setMessage({ tone: 'success', text: `Invite sent to ${parsed.data}.` });
    } catch (e) {
      setMessage({ tone: 'danger', text: rpcErrorMessage(e) });
    }
  };

  const shareLink = async () => {
    if (create.isPending) return;
    setMessage(null);
    try {
      const { token } = await create.mutateAsync({ projectId, target: { kind: 'link' } });
      await Share.share({
        message: `Join my project "${projectTitle}" on KaamSetu: ${inviteLink(token)}`,
      });
    } catch (e) {
      setMessage({ tone: 'danger', text: rpcErrorMessage(e) });
    }
  };

  const describe = (invite: Invite): string => {
    if (invite.freelancer_id)
      return people.data?.[invite.freelancer_id]?.full_name ?? 'A freelancer';
    if (invite.phone_e164) return invite.phone_e164;
    return 'Share link';
  };

  return (
    <View className="gap-3">
      <Text variant="heading">Invite freelancers</Text>
      <Card className="gap-3">
        <Input
          label="Invite by phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          leftAdornment={<Text tone="muted">+91</Text>}
          error={phoneError}
          maxLength={14}
        />
        <Button
          title="Send invite"
          variant="secondary"
          loading={create.isPending && create.variables?.target.kind === 'phone'}
          disabled={create.isPending}
          onPress={() => void invitePhone()}
        />
        <View className="h-px bg-border" />
        <Button
          title="Share an invite link"
          variant="outline"
          loading={create.isPending && create.variables?.target.kind === 'link'}
          disabled={create.isPending}
          onPress={() => void shareLink()}
          accessibilityHint="Creates a private link you can send on WhatsApp or SMS"
        />
        <Button
          title="Find freelancers"
          variant="ghost"
          onPress={() => router.push('/client/find-freelancers')}
          accessibilityHint="Search for a freelancer and invite them from their profile"
        />
      </Card>
      {message ? (
        <Banner
          tone={message.tone}
          title={message.tone === 'success' ? 'Done' : "Couldn't invite"}
          message={message.text}
        />
      ) : null}

      {invites.isPending ? (
        <Skeleton className="h-16" />
      ) : invites.isError ? (
        <Banner
          tone="warning"
          title="Couldn't load invites"
          actionLabel="Retry"
          onAction={() => void invites.refetch()}
        />
      ) : (
        invites.data.map((invite) => (
          <Card key={invite.id} className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="subheading" className="flex-1" numberOfLines={1}>
                {describe(invite)}
              </Text>
              <Badge label={STATUS_LABEL[invite.status]} tone={STATUS_TONE[invite.status]} />
            </View>
            {invite.status === 'pending' || invite.status === 'accepted' ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption">
                  {invite.status === 'pending'
                    ? `Expires ${formatDate(invite.expires_at)}`
                    : 'Can see this project'}
                </Text>
                <Button
                  title={invite.status === 'pending' ? 'Revoke' : 'Remove access'}
                  size="sm"
                  variant="ghost"
                  loading={revoke.isPending && revoke.variables?.inviteId === invite.id}
                  disabled={revoke.isPending}
                  onPress={() => revoke.mutate({ inviteId: invite.id, projectId })}
                  accessibilityHint={
                    invite.status === 'pending'
                      ? 'Cancels this invite'
                      : 'Stops this freelancer from seeing the project'
                  }
                />
              </View>
            ) : null}
          </Card>
        ))
      )}
      {revoke.isError ? (
        <Banner tone="danger" title="Couldn't revoke" message={rpcErrorMessage(revoke.error)} />
      ) : null}
    </View>
  );
}
