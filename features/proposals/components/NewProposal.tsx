import { router } from 'expo-router';

import { Button, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { useProject, useProjectMilestones } from '@/features/projects/api';
import { rpcErrorMessage } from '@/features/projects/errors';

import { ProposalComposer } from './ProposalComposer';

/** Loads the project being bid on, then renders the composer. */
export function NewProposal({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const milestones = useProjectMilestones(projectId);

  if (project.isPending || milestones.isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton className="h-40" />
      </Screen>
    );
  }
  if (project.isError || milestones.isError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message={rpcErrorMessage(project.error ?? milestones.error)}
          onRetry={() => {
            void project.refetch();
            void milestones.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!project.data || project.data.status !== 'open') {
    return (
      <Screen edges={['bottom']}>
        <Text variant="heading">This project is not accepting proposals</Text>
        <Button title="Go back" variant="outline" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']}>
      <ProposalComposer
        project={{
          id: project.data.id,
          total_paise: project.data.total_paise,
          plan: milestones.data.map((m) => ({
            id: m.id,
            title: m.title,
            amount_paise: m.amount_paise,
            due_date: m.due_date,
            deliverable: m.deliverable,
            acceptance_criteria: m.acceptance_criteria,
          })),
        }}
      />
    </Screen>
  );
}
