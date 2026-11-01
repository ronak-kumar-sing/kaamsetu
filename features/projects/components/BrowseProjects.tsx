import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';

import { AnimatedList } from '@/components/motion';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Money,
  Skeleton,
  Text,
} from '@/components/ui';
import { rupeeInputToPaise } from '@/shared/money';

import {
  EMPTY_PROJECT_FILTERS,
  useSearchProjects,
  useSkills,
  type ProjectSearchFilters,
  type SearchProjectRow,
} from '../api';
import { PROJECT_CATEGORIES } from '../categories';
import { rpcErrorMessage } from '../errors';
import { relativeTime } from '../format';
import { routes } from '../routes';
import { useDebounced } from '../useDebounced';
import { BottomSheet } from './BottomSheet';
import { Chip } from './Chip';
import { SkillPicker } from './SkillPicker';

export function BrowseProjects() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ProjectSearchFilters>(EMPTY_PROJECT_FILTERS);
  const [open, setOpen] = useState(false);
  const skills = useSkills();
  const skillNames = useMemo(
    () => new Map((skills.data ?? []).map((s) => [s.id, s.name])),
    [skills.data],
  );

  const debouncedQuery = useDebounced(query);
  const debouncedCity = useDebounced(filters.city);
  const effective: ProjectSearchFilters = {
    ...filters,
    query: debouncedQuery,
    city: debouncedCity,
  };
  const search = useSearchProjects(effective);
  const rows = useMemo<SearchProjectRow[]>(() => search.data?.pages.flat() ?? [], [search.data]);

  const activeFilters =
    (filters.category ? 1 : 0) +
    (filters.city.trim() ? 1 : 0) +
    (filters.minPaise !== null || filters.maxPaise !== null ? 1 : 0) +
    filters.skillIds.length;

  return (
    <View className="flex-1">
      <View className="gap-2 px-4 pb-2 pt-4">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search projects"
          accessibilityLabel="Search projects"
          returnKeyType="search"
          autoCapitalize="none"
        />
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 flex-row items-center gap-2">
            <Switch
              value={filters.takeoverOnly}
              onValueChange={(takeoverOnly) => setFilters((f) => ({ ...f, takeoverOnly }))}
              accessibilityLabel="Takeover projects only"
            />
            <Text variant="caption">Takeover</Text>
          </View>
          <Button
            title={activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}
            size="sm"
            variant="outline"
            onPress={() => setOpen(true)}
          />
        </View>
      </View>

      {search.isPending ? (
        <View className="gap-3 px-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
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
              title="No projects match"
              description="Try a broader search or clear some filters."
              actionLabel={activeFilters > 0 ? 'Clear filters' : undefined}
              onAction={() => setFilters(EMPTY_PROJECT_FILTERS)}
            />
          }
          ListFooterComponent={
            search.isFetchingNextPage ? (
              <ActivityIndicator className="py-4 text-primary" />
            ) : undefined
          }
          renderItem={({ item }) => (
            <View className="mb-3">
              <Card onPress={() => router.push(routes.project(item.id))} className="gap-2">
                <Text variant="subheading" numberOfLines={2}>
                  {item.title}
                </Text>
                <Text variant="caption">
                  {[item.client_name, item.client_city].filter(Boolean).join(' · ')}
                </Text>
                <View className="flex-row items-center justify-between">
                  <Money paise={item.total_paise} variant="subheading" />
                  <Text variant="caption">
                    {item.milestone_count} {item.milestone_count === 1 ? 'milestone' : 'milestones'}
                  </Text>
                </View>
                {item.skill_ids.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5">
                    {item.skill_ids.slice(0, 4).map((id) => (
                      <Badge key={id} label={skillNames.get(id) ?? 'Skill'} tone="neutral" />
                    ))}
                  </View>
                ) : null}
                <View className="flex-row items-center gap-2">
                  {item.is_takeover ? <Badge label="Takeover" tone="warning" /> : null}
                  <Text variant="caption">{relativeTime(item.published_at)}</Text>
                </View>
              </Card>
            </View>
          )}
        />
      )}

      <FiltersSheet
        visible={open}
        filters={filters}
        onChange={setFilters}
        onClose={() => setOpen(false)}
        skills={skills.data ?? []}
      />
    </View>
  );
}

function FiltersSheet({
  visible,
  filters,
  onChange,
  onClose,
  skills,
}: {
  visible: boolean;
  filters: ProjectSearchFilters;
  onChange: (f: ProjectSearchFilters) => void;
  onClose: () => void;
  skills: readonly { id: string; name: string }[];
}) {
  const [min, setMin] = useState(filters.minPaise === null ? '' : String(filters.minPaise / 100));
  const [max, setMax] = useState(filters.maxPaise === null ? '' : String(filters.maxPaise / 100));

  const apply = () => {
    onChange({
      ...filters,
      minPaise: min.trim() === '' ? null : rupeeInputToPaise(min),
      maxPaise: max.trim() === '' ? null : rupeeInputToPaise(max),
    });
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Filters" onClose={onClose}>
      <View className="gap-2">
        <Text variant="subheading">Category</Text>
        <View className="flex-row flex-wrap gap-2">
          {PROJECT_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category}
              selected={filters.category === category}
              onPress={() =>
                onChange({ ...filters, category: filters.category === category ? null : category })
              }
            />
          ))}
        </View>
      </View>
      <Input
        label="City"
        value={filters.city}
        onChangeText={(city) => onChange({ ...filters, city })}
        placeholder="e.g. Pune"
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Input
            label="Min budget"
            value={min}
            onChangeText={setMin}
            keyboardType="decimal-pad"
            leftAdornment={<Text tone="muted">₹</Text>}
          />
        </View>
        <View className="flex-1">
          <Input
            label="Max budget"
            value={max}
            onChangeText={setMax}
            keyboardType="decimal-pad"
            leftAdornment={<Text tone="muted">₹</Text>}
          />
        </View>
      </View>
      <SkillPicker
        skills={skills}
        selected={filters.skillIds}
        onChange={(skillIds) => onChange({ ...filters, skillIds })}
        max={10}
      />
      <Button title="Show results" onPress={apply} />
      <Button
        title="Clear all"
        variant="ghost"
        onPress={() => {
          setMin('');
          setMax('');
          onChange(EMPTY_PROJECT_FILTERS);
        }}
      />
    </BottomSheet>
  );
}
