import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  Input,
  Money,
  SegmentedControl,
  Skeleton,
  Text,
  type BadgeTone,
} from '@/components/ui';
import { avatarUrl } from '@/features/profiles/api';
import { usePublicProfiles, type PublicProfile } from '@/features/freelancers/api';
import { rpcErrorMessage } from '@/features/projects/errors';
import { relativeTime } from '@/features/projects/format';
import { LoadMore } from '@/features/projects/components/LoadMore';
import { BottomSheet } from '@/features/projects/components/BottomSheet';
import { routes } from '@/features/projects/routes';
import { formatINR } from '@/shared/money';

import {
  parseMilestoneEdits,
  useAcceptProposal,
  useProjectProposals,
  useRejectProposal,
  type Proposal,
  type ProposalStatus,
} from '../api';
import { planTotal, priceChanged, type PlanRowView } from '../diff';
import { PlanCompare } from './PlanCompare';

const STATUS_TONE: Record<ProposalStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
};
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export interface ProposalsSectionProps {
  projectId: string;
  /** The project's current plan, for comparing against suggested plans. */
  currentPlan: readonly PlanRowView[];
  /** Only an open project can award a proposal. */
  canDecide: boolean;
}

export function ProposalsSection({ projectId, currentPlan, canDecide }: ProposalsSectionProps) {
  const proposals = useProjectProposals(projectId);
  const authorIds = (proposals.data ?? []).map((p) => p.freelancer_id);
  const authors = usePublicProfiles(authorIds);
  const [accepting, setAccepting] = useState<Proposal | null>(null);
  const [rejecting, setRejecting] = useState<Proposal | null>(null);

  if (proposals.isPending) return <Skeleton className="h-28" />;
  if (proposals.isError) {
    return (
      <ErrorState
        title="Couldn't load proposals"
        onRetry={() => void proposals.refetch()}
        message={rpcErrorMessage(proposals.error)}
      />
    );
  }

  const list = proposals.data;
  const countLabel = proposals.hasNextPage ? `${list.length}+` : String(list.length);
  return (
    <View className="gap-3">
      <Text variant="heading">Proposals ({countLabel})</Text>
      {list.length === 0 ? (
        <Text variant="body" tone="muted">
          No proposals yet. Freelancers who find your project will appear here.
        </Text>
      ) : null}
      {list.map((proposal) => {
        const author = authors.data?.[proposal.freelancer_id];
        const parsedEdits = parseMilestoneEdits(proposal.milestone_edits);
        const edits = parsedEdits && parsedEdits.length > 0 ? parsedEdits : null;
        return (
          <Card key={proposal.id} className="gap-3">
            <View className="flex-row items-center gap-3">
              <Avatar
                uri={avatarUrl(author?.avatar_path)}
                name={author?.full_name ?? 'Freelancer'}
              />
              <View className="flex-1">
                <Text variant="subheading" numberOfLines={1}>
                  {author?.full_name ?? 'Freelancer'}
                </Text>
                <Text variant="caption">{relativeTime(proposal.created_at)}</Text>
              </View>
              <Badge
                label={PROPOSAL_STATUS_LABEL[proposal.status]}
                tone={STATUS_TONE[proposal.status]}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <Money paise={proposal.proposed_total_paise} variant="subheading" />
              <Text variant="caption">{proposal.timeline_days} days</Text>
            </View>
            <Text variant="body" numberOfLines={4}>
              {proposal.cover_note}
            </Text>
            {edits ? <Badge label="Suggests a different milestone plan" tone="info" /> : null}
            <View className="flex-row flex-wrap gap-2">
              <Button
                title="View profile"
                size="sm"
                variant="ghost"
                onPress={() => router.push(routes.profile(proposal.freelancer_id))}
              />
              {canDecide && proposal.status === 'pending' ? (
                <>
                  <Button
                    title="Reject"
                    size="sm"
                    variant="outline"
                    onPress={() => setRejecting(proposal)}
                  />
                  <Button title="Accept" size="sm" onPress={() => setAccepting(proposal)} />
                </>
              ) : null}
            </View>
          </Card>
        );
      })}

      <LoadMore
        hasNextPage={proposals.hasNextPage}
        isFetchingNextPage={proposals.isFetchingNextPage}
        onLoadMore={() => void proposals.fetchNextPage()}
      />

      <AcceptSheet
        proposal={accepting}
        author={accepting ? authors.data?.[accepting.freelancer_id] : undefined}
        projectId={projectId}
        currentPlan={currentPlan}
        onClose={() => setAccepting(null)}
      />
      <RejectSheet proposal={rejecting} projectId={projectId} onClose={() => setRejecting(null)} />
    </View>
  );
}

function AcceptSheet({
  proposal,
  author,
  projectId,
  currentPlan,
  onClose,
}: {
  proposal: Proposal | null;
  author: PublicProfile | undefined;
  projectId: string;
  currentPlan: readonly PlanRowView[];
  onClose: () => void;
}) {
  const accept = useAcceptProposal();
  const [useTheirPlan, setUseTheirPlan] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parsed = proposal ? parseMilestoneEdits(proposal.milestone_edits) : null;
  const edits = parsed && parsed.length > 0 ? parsed : null;
  const name = author?.full_name ?? 'this freelancer';
  const currentTotal = planTotal(currentPlan);
  const priceDiffers = proposal ? priceChanged(proposal.proposed_total_paise, currentTotal) : false;
  // D26: a changed price only makes sense with the freelancer's plan, so it cannot be declined.
  const mustApply = edits !== null && priceDiffers;
  const apply = edits !== null && (mustApply || useTheirPlan);

  const close = () => {
    setError(null);
    setUseTheirPlan(true);
    onClose();
  };

  const confirm = async () => {
    if (!proposal || accept.isPending) return;
    setError(null);
    try {
      await accept.mutateAsync({
        proposalId: proposal.id,
        projectId,
        applyMilestoneEdits: apply,
      });
      close();
    } catch (e) {
      setError(rpcErrorMessage(e));
    }
  };

  return (
    <BottomSheet visible={proposal !== null} title={`Accept ${name}'s proposal`} onClose={close}>
      {error ? <Banner tone="danger" title="Couldn't accept" message={error} /> : null}
      <Text variant="body">
        This awards the project to {name} and declines every other pending proposal and invite.
        Funding opens after the agreement is signed.
      </Text>
      {proposal ? (
        <View className="flex-row items-center justify-between">
          <Text variant="subheading">Agreement price</Text>
          <Money paise={proposal.proposed_total_paise} variant="subheading" />
        </View>
      ) : null}
      {edits ? (
        <View className="gap-3">
          {mustApply ? (
            <Banner
              tone="info"
              title="Their plan comes with their price"
              message={`${name} changed the price from ${formatINR(currentTotal)}, so their milestone plan replaces yours. To keep your plan, reject this proposal and invite a new one.`}
            />
          ) : (
            <>
              <Text variant="subheading">Which milestone plan?</Text>
              <SegmentedControl
                options={[
                  { value: 'theirs', label: 'Their plan' },
                  { value: 'mine', label: 'Keep mine' },
                ]}
                value={useTheirPlan ? 'theirs' : 'mine'}
                onChange={(v) => setUseTheirPlan(v === 'theirs')}
              />
            </>
          )}
          <PlanCompare current={currentPlan} proposed={edits} />
        </View>
      ) : null}
      <Button title="Accept and award" loading={accept.isPending} onPress={() => void confirm()} />
      <Button title="Cancel" variant="ghost" onPress={close} />
    </BottomSheet>
  );
}

function RejectSheet({
  proposal,
  projectId,
  onClose,
}: {
  proposal: Proposal | null;
  projectId: string;
  onClose: () => void;
}) {
  const reject = useRejectProposal();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };
  const confirm = async () => {
    if (!proposal || reject.isPending) return;
    setError(null);
    try {
      await reject.mutateAsync({ proposalId: proposal.id, projectId, reason: reason.trim() });
      setReason('');
      onClose();
    } catch (e) {
      setError(rpcErrorMessage(e));
    }
  };

  return (
    <BottomSheet visible={proposal !== null} title="Reject this proposal?" onClose={close}>
      {error ? <Banner tone="danger" title="Couldn't reject" message={error} /> : null}
      <Input
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        placeholder="Shared with the freelancer"
        multiline
        className="min-h-[72px]"
        textAlignVertical="top"
        maxLength={500}
      />
      <Button
        title="Reject proposal"
        variant="danger"
        loading={reject.isPending}
        onPress={() => void confirm()}
      />
      <Button title="Keep it" variant="ghost" onPress={close} />
    </BottomSheet>
  );
}
