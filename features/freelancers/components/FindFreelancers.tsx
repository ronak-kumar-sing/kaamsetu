import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AnimatedList } from '@/components/motion';
import { Button, EmptyState, ErrorState, Input, Skeleton, Text } from '@/components/ui';
import { useSkills } from '@/features/projects/api';
import { BottomSheet } from '@/features/projects/components/BottomSheet';
import { SkillPicker } from '@/features/projects/components/SkillPicker';
import { rpcErrorMessage } from '@/features/projects/errors';
import { routes } from '@/features/projects/routes';
import { useDebounced } from '@/features/projects/useDebounced';

import { useSearchFreelancers, type FreelancerRow } from '../api';
import { FreelancerCard } from './FreelancerCard';

export function FindFreelancers() {
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const skills = useSkills();

  const filters = {
    query: useDebounced(query),
    city: useDebounced(city),
    skillIds,
  };
  const search = useSearchFreelancers(filters);
  const rows = useMemo<FreelancerRow[]>(() => search.data?.pages.flat() ?? [], [search.data]);

  const activeFilters = skillIds.length + (city.trim() ? 1 : 0);

  return (
    <View className="flex-1">
      <View className="gap-2 px-4 pb-2 pt-4">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or headline"
          accessibilityLabel="Search freelancers"
          returnKeyType="search"
          autoCapitalize="none"
        />
        <View className="flex-row items-center justify-between">
          <Text variant="caption">
            {search.isPending
              ? 'Searching...'
              : `${rows.length}${search.hasNextPage ? '+' : ''} found`}
          </Text>
          <Button
            title={activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}
            size="sm"
            variant="outline"
            onPress={() => setFiltersOpen(true)}
          />
        </View>
      </View>

      {search.isPending ? (
        <View className="gap-3 px-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </View>
      ) : search.isError && rows.length === 0 ? (
        <ErrorState message={rpcErrorMessage(search.error)} onRetry={() => void search.refetch()} />
      ) : (
        <AnimatedList
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerClassName="flex-grow px-4 pb-6"
          refreshing={search.isRefetching && !search.isFetchingNextPage}
          onRefresh={() => void search.refetch()}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
          }}
          ListEmptyComponent={
            <EmptyState
              title="No freelancers found"
              description="Try a different search or remove a filter."
            />
          }
          ListFooterComponent={
            search.isFetchingNextPage ? (
              <ActivityIndicator className="py-4 text-primary" />
            ) : undefined
          }
          renderItem={({ item }) => (
            <FreelancerCard
              freelancer={item}
              onPress={() => router.push(routes.profile(item.id))}
            />
          )}
        />
      )}

      <BottomSheet visible={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <Input label="City" value={city} onChangeText={setCity} placeholder="e.g. Pune" />
        {skills.data ? (
          <SkillPicker skills={skills.data} selected={skillIds} onChange={setSkillIds} max={10} />
        ) : null}
        <Button
          title="Clear filters"
          variant="outline"
          onPress={() => {
            setCity('');
            setSkillIds([]);
          }}
        />
        <Button title="Show results" onPress={() => setFiltersOpen(false)} />
      </BottomSheet>
    </View>
  );
}
