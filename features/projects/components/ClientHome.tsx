import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { AnimatedList } from '@/components/motion';
import { EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import type { ProjectStatus } from '@/shared/schemas/projects';

import { useMyProjects, type Project } from '../api';
import { routes } from '../routes';
import { LoadMore } from './LoadMore';
import { ProjectCard } from './ProjectCard';

type Row =
  | { type: 'header'; key: string; title: string }
  | { type: 'project'; key: string; project: Project };

const GROUPS: { title: string; statuses: readonly ProjectStatus[] }[] = [
  { title: 'Drafts', statuses: ['draft'] },
  { title: 'Open', statuses: ['open'] },
  { title: 'Awarded and in progress', statuses: ['awarded', 'in_progress'] },
  { title: 'Completed', statuses: ['completed'] },
  { title: 'Cancelled', statuses: ['cancelled'] },
];

export function groupProjects(projects: readonly Project[]): Row[] {
  const rows: Row[] = [];
  for (const group of GROUPS) {
    const inGroup = projects.filter((p) => group.statuses.includes(p.status));
    if (inGroup.length === 0) continue;
    rows.push({ type: 'header', key: `h-${group.title}`, title: group.title });
    for (const project of inGroup) rows.push({ type: 'project', key: project.id, project });
  }
  return rows;
}

export function ClientHome() {
  const query = useMyProjects();
  const rows = useMemo(() => groupProjects(query.data?.projects ?? []), [query.data]);

  if (query.isPending) {
    return (
      <View className="gap-3 p-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </View>
    );
  }
  if (query.isError && !query.data) {
    return (
      <ErrorState message="We couldn't load your projects." onRetry={() => void query.refetch()} />
    );
  }

  return (
    <AnimatedList
      data={rows}
      keyExtractor={(row) => row.key}
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
      ListEmptyComponent={
        <EmptyState
          title="No projects yet"
          description="Post a project with milestone payments and receive proposals from verified freelancers."
          actionLabel="Post a project"
          onAction={() => router.push(routes.postProject)}
        />
      }
      renderItem={({ item }) =>
        item.type === 'header' ? (
          <Text variant="label" tone="muted" className="mb-2 mt-2">
            {item.title}
          </Text>
        ) : (
          <ProjectCard
            title={item.project.title}
            status={item.project.status}
            totalPaise={item.project.total_paise}
            updatedAt={item.project.updated_at}
            pendingProposals={query.data?.pendingProposals[item.project.id] ?? 0}
            onPress={() =>
              router.push(
                item.project.status === 'draft'
                  ? routes.editDraft(item.project.id)
                  : routes.project(item.project.id),
              )
            }
          />
        )
      }
    />
  );
}
