import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { useUserId, useProject } from '../api';
import { rpcErrorMessage } from '../errors';
import { ClientProjectView } from './ClientProjectView';
import { FreelancerProjectView } from './FreelancerProjectView';

/** Picks the client or freelancer/visitor view for a project based on who is looking. */
export function ProjectDetail({ id }: { id: string }) {
  const userId = useUserId();
  const project = useProject(id);

  if (project.isPending) {
    return (
      <Screen edges={['bottom']}>
        <View className="gap-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-40" />
        </View>
      </Screen>
    );
  }
  if (project.isError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message={rpcErrorMessage(project.error)}
          onRetry={() => void project.refetch()}
        />
      </Screen>
    );
  }
  if (!project.data) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-3">
          <Text variant="heading">Project not found</Text>
          <Text tone="muted" className="text-center">
            It may have been removed, or you may not have access to it.
          </Text>
          <Button title="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (project.data.client_id === userId) return <ClientProjectView project={project.data} />;
  return (
    <FreelancerProjectView
      project={project.data}
      isAssigned={project.data.freelancer_id === userId}
    />
  );
}
