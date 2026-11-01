import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/types/database';

export type PublicProfile = Tables<'public_profiles'>;
export type FreelancerRow =
  Database['public']['Functions']['rpc_search_freelancers']['Returns'][number];

export const FREELANCER_PAGE_SIZE = 20;

export interface FreelancerSearchFilters {
  query: string;
  city: string;
  skillIds: string[];
}

export const EMPTY_FREELANCER_FILTERS: FreelancerSearchFilters = {
  query: '',
  city: '',
  skillIds: [],
};

export const freelancerKeys = {
  all: ['freelancers'] as const,
  search: (filters: FreelancerSearchFilters) => [...freelancerKeys.all, 'search', filters] as const,
  profile: (id: string) => [...freelancerKeys.all, 'profile', id] as const,
  skills: (id: string) => [...freelancerKeys.all, 'skills', id] as const,
  names: (ids: readonly string[]) => [...freelancerKeys.all, 'names', [...ids].sort()] as const,
};

export function useSearchFreelancers(filters: FreelancerSearchFilters) {
  return useInfiniteQuery({
    queryKey: freelancerKeys.search(filters),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FreelancerRow[]> => {
      const { data, error } = await supabase.rpc('rpc_search_freelancers', {
        p_query: filters.query.trim() || undefined,
        p_skill_ids: filters.skillIds.length > 0 ? filters.skillIds : undefined,
        p_city: filters.city.trim() || undefined,
        p_limit: FREELANCER_PAGE_SIZE,
        p_cursor: pageParam ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.length < FREELANCER_PAGE_SIZE
        ? undefined
        : (lastPage[lastPage.length - 1]?.onboarding_completed_at ?? undefined),
  });
}

export function usePublicProfile(id: string | undefined) {
  return useQuery({
    queryKey: freelancerKeys.profile(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<PublicProfile | null> => {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useProfileSkills(id: string | undefined) {
  return useQuery({
    queryKey: freelancerKeys.skills(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<Pick<Tables<'skills'>, 'id' | 'name'>[]> => {
      const { data, error } = await supabase
        .from('profile_skills')
        .select('skills(id, name)')
        .eq('profile_id', id!);
      if (error) throw error;
      return data.flatMap((row) => (row.skills ? [row.skills] : []));
    },
  });
}

/** Display names for a set of user ids (proposal authors, invitees). */
export function usePublicProfiles(ids: readonly string[]) {
  return useQuery({
    queryKey: freelancerKeys.names(ids),
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, PublicProfile>> => {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('*')
        .in('id', [...ids]);
      if (error) throw error;
      return Object.fromEntries(data.map((p) => [p.id, p]));
    },
  });
}
