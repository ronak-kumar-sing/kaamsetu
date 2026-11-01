import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FadeContent } from '@/components/motion/FadeContent';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  Input,
  Screen,
  Skeleton,
  Text,
} from '@/components/ui';
import { InviteSection } from '@/features/invites/components/InviteSection';
import { usePublicProfile } from '@/features/freelancers/api';
import { ProposalsSection } from '@/features/proposals/components/ProposalsSection';

import { useCancelProject, useProjectMilestones, useProjectSkills, type Project } from '../api';
import { rpcErrorMessage } from '../errors';
import { routes } from '../routes';
import { BottomSheet } from './BottomSheet';
import { MilestoneTimeline } from './MilestoneTimeline';
import { ProjectHeader } from './ProjectHeader';

const CANCELLABLE = ['draft', 'open', 'awarded'] as const;

export function ClientProjectView({ project }: { project: Project }) {
  const milestones = useProjectMilestones(project.id);
  const skills = useProjectSkills(project.id);
  const freelancer = usePublicProfile(project.freelancer_id ?? undefined);
  const cancel = useCancelProject();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const canCancel =
    (CANCELLABLE as readonly string[]).includes(project.status) &&
    (milestones.data ?? []).every((m) => m.status === 'draft');

  const confirmCancel = async () => {
    if (cancel.isPending) return;
    setCancelError(null);
    try {
      await cancel.mutateAsync({ projectId: project.id, reason: reason.trim() });
      setCancelOpen(false);
      setReason('');
    } catch (e) {
      setCancelError(rpcErrorMessage(e));
    }
  };

  const plan = (milestones.data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    amount_paise: m.amount_paise,
    due_date: m.due_date,
  }));

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

        {project.status === 'draft' ? (
          <Banner
            tone="info"
            title="This project is a draft"
            message="Only you can see it. Publish it when the milestone plan is ready."
            actionLabel="Continue editing"
            onAction={() => router.push(routes.editDraft(project.id))}
          />
        ) : null}

        {project.status === 'awarded' ? (
          <Banner
            tone="info"
            title="Awarded"
            message="Funding opens after the agreement is signed (coming next)."
          />
        ) : null}

        {project.freelancer_id ? (
          <Card
            onPress={() => router.push(routes.profile(project.freelancer_id!))}
            className="gap-1"
          >
            <Text variant="label" tone="muted">
              Freelancer
            </Text>
            <Text variant="subheading">{freelancer.data?.full_name ?? 'Assigned freelancer'}</Text>
          </Card>
        ) : null}

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
              onPressMilestone={(id) => router.push(routes.milestone(id))}
            />
          )}
        </View>

        {project.status === 'open' || project.status === 'awarded' ? (
          <ProposalsSection
            projectId={project.id}
            currentPlan={plan}
            canDecide={project.status === 'open'}
          />
        ) : null}

        {project.status === 'open' ? (
          <InviteSection projectId={project.id} projectTitle={project.title} />
        ) : null}

        {canCancel ? (
          <Button
            title="Cancel project"
            variant="ghost"
            onPress={() => setCancelOpen(true)}
            accessibilityHint="Asks for confirmation before cancelling"
          />
        ) : null}
      </View>

      <BottomSheet
        visible={cancelOpen}
        title="Cancel this project?"
        onClose={() => setCancelOpen(false)}
      >
        {cancelError ? (
          <Banner tone="danger" title="Couldn't cancel" message={cancelError} />
        ) : null}
        <Text variant="body">
          Pending proposals are rejected and invites are revoked. This cannot be undone.
        </Text>
        <Input
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          multiline
          className="min-h-[72px]"
          textAlignVertical="top"
          maxLength={500}
        />
        <Button
          title="Cancel project"
          variant="danger"
          loading={cancel.isPending}
          onPress={() => void confirmCancel()}
        />
        <Button title="Keep project" variant="ghost" onPress={() => setCancelOpen(false)} />
      </BottomSheet>
    </Screen>
  );
}
