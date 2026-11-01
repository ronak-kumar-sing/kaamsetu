import { router } from 'expo-router';
import { View } from 'react-native';

import { AnimatedList } from '@/components/motion';
import { EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { MyInvitesSection } from '@/features/invites/components/MyInvitesSection';

import { useMyAwardedProjects, type Project } from '../api';
import { rpcErrorMessage } from '../errors';
import { routes } from '../routes';
import { LoadMore } from './LoadMore';
import { ProjectCard } from './ProjectCard';

export function FreelancerHome() {
  const query = useMyAwardedProjects();

  return (
    <AnimatedList<Project>
      data={query.data ?? []}
      keyExtractor={(p) => p.id}
      contentContainerClassName="flex-grow px-4 py-4"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListFooterComponent={
        <LoadMore
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          onLoadMore={() => void query.fetchNextPage()}
        />
      }
      ListHeaderComponent={
        <View className="gap-4 pb-2">
          <MyInvitesSection />
          {(query.data?.length ?? 0) > 0 ? <Text variant="heading">Your projects</Text> : null}
        </View>
      }
      ListEmptyComponent={
        query.isPending ? (
          <View className="gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </View>
        ) : query.isError ? (
          <ErrorState message={rpcErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState
            title="No active projects"
            description="Projects you win will show up here. Browse open projects to send your first proposal."
            actionLabel="Browse projects"
            onAction={() => router.push(routes.browse)}
          />
        )
      }
      renderItem={({ item }) => (
        <ProjectCard
          title={item.title}
          status={item.status}
          totalPaise={item.total_paise}
          updatedAt={item.updated_at}
          onPress={() => router.push(routes.project(item.id))}
        />
      )}
    />
  );
}
