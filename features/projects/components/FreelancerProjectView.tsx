import { router } from 'expo-router';
import { View } from 'react-native';

import { FadeContent } from '@/components/motion/FadeContent';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  Money,
  Screen,
  Skeleton,
  Text,
} from '@/components/ui';
import { usePublicProfile } from '@/features/freelancers/api';
import { useMyProposals } from '@/features/proposals/api';
import { formatINR } from '@/shared/money';
import { PROPOSAL_STATUS_LABEL } from '@/features/proposals/components/ProposalsSection';

import { useProjectMilestones, useProjectSkills, type Project } from '../api';
import { rpcErrorMessage } from '../errors';
import { formatDate } from '../format';
import { routes } from '../routes';
import { MilestoneTimeline } from './MilestoneTimeline';
import { ProjectHeader } from './ProjectHeader';

export interface FreelancerProjectViewProps {
  project: Project;
  /** True when the signed-in user is the awarded freelancer. */
  isAssigned: boolean;
}

/** The project as seen by an assigned freelancer or a prospective bidder. */
export function FreelancerProjectView({ project, isAssigned }: FreelancerProjectViewProps) {
  const milestones = useProjectMilestones(project.id);
  const skills = useProjectSkills(project.id);
  const client = usePublicProfile(project.client_id);
  const proposals = useMyProposals();

  const myProposal = (proposals.data ?? []).find(
    (p) => p.project_id === project.id && (p.status === 'pending' || p.status === 'accepted'),
  );
  const canPropose = project.status === 'open' && !isAssigned && !myProposal;

  return (
    <Screen scroll edges={['bottom']}>
      <View className="gap-6">
        <FadeContent>
          <ProjectHeader
            title={project.title}
            status={project.status}
            totalPaise={project.total_paise}
            subtitle={[project.category, project.is_remote ? 'Remote' : project.city]
              .filter(Boolean)
              .join(' · ')}
          />
        </FadeContent>

        {isAssigned && (project.status === 'awarded' || project.status === 'in_progress') ? (
          <Banner
            tone="info"
            title={project.status === 'awarded' ? 'You got the project' : 'Work is under way'}
            message={
              project.status === 'awarded'
                ? 'Funding opens after the agreement is signed (coming next).'
                : 'Start each funded milestone, then submit your work for approval.'
            }
          />
        ) : null}

        {myProposal ? (
          <Banner
            tone="success"
            title={`Your proposal is ${PROPOSAL_STATUS_LABEL[myProposal.status].toLowerCase()}`}
            message={`${formatINR(myProposal.proposed_total_paise)} in ${myProposal.timeline_days} days`}
            actionLabel="See my proposals"
            onAction={() => router.push('/freelancer/proposals')}
          />
        ) : null}

        <Card className="gap-1">
          <Text variant="label" tone="muted">
            Posted by
          </Text>
          <Text variant="subheading">{client.data?.full_name ?? 'Client'}</Text>
          {client.data?.city ? <Text variant="caption">{client.data.city}</Text> : null}
          {project.published_at ? (
            <Text variant="caption">Published {formatDate(project.published_at)}</Text>
          ) : null}
        </Card>

        <View className="gap-2">
          <Text variant="heading">About this project</Text>
          <Text variant="body">{project.description}</Text>
          {skills.data && skills.data.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {skills.data.map((s) => (
                <Badge key={s.id} label={s.name} tone="neutral" />
              ))}
            </View>
          ) : null}
          <View className="flex-row items-center gap-2">
            <Text variant="caption">Total</Text>
            <Money paise={project.total_paise} variant="subheading" />
          </View>
        </View>

        <View className="gap-3">
          <Text variant="heading">Milestones</Text>
          {milestones.isPending ? (
            <Skeleton className="h-28" />
          ) : milestones.isError ? (
            <ErrorState
              title="Couldn't load milestones"
              message={rpcErrorMessage(milestones.error)}
              onRetry={() => void milestones.refetch()}
            />
          ) : (
            <MilestoneTimeline
              milestones={milestones.data}
              onPressMilestone={isAssigned ? (id) => router.push(routes.milestone(id)) : undefined}
            />
          )}
        </View>

        {canPropose ? (
          <Button
            title="Send proposal"
            onPress={() => router.push(routes.newProposal(project.id))}
            accessibilityHint="Opens the proposal form"
          />
        ) : null}
      </View>
    </Screen>
  );
}
