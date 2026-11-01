import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorState, LoadingState, Screen, Text } from '@/components/ui';
import { useProject, useProjectMilestones, useProjectSkills } from '@/features/projects/api';
import { draftToBuilderInitial } from '@/features/projects/draft';
import { ProjectBuilder } from '@/features/projects/components/ProjectBuilder';
import { routes } from '@/features/projects/routes';

export default function PostProjectScreen() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  // Bumping the key after a finished save resets the builder for the next project.
  const [session, setSession] = useState(0);

  const project = useProject(draftId);
  const milestones = useProjectMilestones(draftId);
  const skills = useProjectSkills(draftId);

  if (draftId) {
    if (project.isPending || milestones.isPending || skills.isPending) return <LoadingState />;
    if (project.isError || milestones.isError || skills.isError || !project.data) {
      return (
        <ErrorState
          message="We couldn't load this draft."
          onRetry={() => {
            void project.refetch();
            void milestones.refetch();
            void skills.refetch();
          }}
        />
      );
    }
    if (project.data.status !== 'draft') {
      return (
        <Screen>
          <Text variant="body">This project is already published.</Text>
          <Button title="View project" onPress={() => router.replace(routes.project(draftId))} />
        </Screen>
      );
    }
  }

  const initial =
    draftId && project.data && milestones.data && skills.data
      ? draftToBuilderInitial(project.data, milestones.data, skills.data)
      : undefined;

  return (
    <Screen scroll edges={[]}>
      <ProjectBuilder
        key={`${draftId ?? 'new'}-${session}`}
        initial={initial}
        onFinished={(id) => {
          setSession((s) => s + 1);
          router.push(routes.project(id));
        }}
      />
    </Screen>
  );
}
