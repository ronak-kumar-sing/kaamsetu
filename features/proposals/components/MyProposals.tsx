import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AnimatedList } from '@/components/motion';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Money,
  SegmentedControl,
  Skeleton,
  Text,
} from '@/components/ui';
import { rpcErrorMessage } from '@/features/projects/errors';
import { relativeTime } from '@/features/projects/format';
import { LoadMore } from '@/features/projects/components/LoadMore';
import { routes } from '@/features/projects/routes';

import { useMyProposals, useWithdrawProposal, type MyProposal, type ProposalStatus } from '../api';
import { PROPOSAL_STATUS_LABEL } from './ProposalsSection';

const FILTERS: { value: ProposalStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export function MyProposals() {
  const [status, setStatus] = useState<ProposalStatus>('pending');
  const query = useMyProposals();
  const withdraw = useWithdrawProposal();
  const rows = useMemo<MyProposal[]>(
    () => (query.data ?? []).filter((p) => p.status === status),
    [query.data, status],
  );

  return (
    <View className="flex-1">
      <View className="gap-3 px-4 pb-2 pt-4">
        <SegmentedControl options={FILTERS} value={status} onChange={setStatus} />
        {withdraw.isError ? (
          <Banner
            tone="danger"
            title="Couldn't withdraw"
            message={rpcErrorMessage(withdraw.error)}
          />
        ) : null}
      </View>
      {query.isPending ? (
        <View className="gap-3 px-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </View>
      ) : query.isError && !query.data ? (
        <ErrorState message={rpcErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <AnimatedList
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerClassName="flex-grow px-4 pb-6"
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
              title={`No ${PROPOSAL_STATUS_LABEL[status].toLowerCase()} proposals`}
              description="Browse open projects and send a proposal that stands out."
              actionLabel="Browse projects"
              onAction={() => router.push(routes.browse)}
            />
          }
          renderItem={({ item }) => (
            <View className="mb-3">
              <Card
                onPress={
                  item.project ? () => router.push(routes.project(item.project!.id)) : undefined
                }
                className="gap-2"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text variant="subheading" className="flex-1" numberOfLines={2}>
                    {item.project?.title ?? 'Project'}
                  </Text>
                  <Badge
                    label={PROPOSAL_STATUS_LABEL[item.status]}
                    tone={
                      item.status === 'accepted'
                        ? 'success'
                        : item.status === 'pending'
                          ? 'warning'
                          : 'neutral'
                    }
                  />
                </View>
                <View className="flex-row items-center justify-between">
                  <Money paise={item.proposed_total_paise} />
                  <Text variant="caption">
                    {item.timeline_days} days · {relativeTime(item.created_at)}
                  </Text>
                </View>
                {item.status === 'pending' ? (
                  <Button
                    title="Withdraw"
                    size="sm"
                    variant="outline"
                    loading={withdraw.isPending && withdraw.variables === item.id}
                    disabled={withdraw.isPending}
                    onPress={() => withdraw.mutate(item.id)}
                    accessibilityHint="Withdraws this proposal"
                  />
                ) : null}
              </Card>
            </View>
          )}
        />
      )}
    </View>
  );
}
