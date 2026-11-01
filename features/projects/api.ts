import {
  useInfiniteQuery,
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/store';
import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/types/database';

import {
  toDraftMilestones,
  toProjectPayload,
  type BasicsDraft,
  type MilestoneDraft,
  type SettingsDraft,
} from './builder';

export type Project = Tables<'projects'>;
export type Milestone = Tables<'milestones'>;
export type Skill = Tables<'skills'>;
export type ProjectStatus = Database['public']['Enums']['project_status'];
export type SearchProjectRow =
  Database['public']['Functions']['rpc_search_projects']['Returns'][number];

export const PAGE_SIZE = 20;
/** Rows per page on the "my ..." lists, loaded with range requests. */
export const LIST_PAGE_SIZE = 30;

function pageRange(page: number, size: number = LIST_PAGE_SIZE): [number, number] {
  return [page * size, page * size + size - 1];
}

/** Next page number, or undefined when the last page came back short. */
export function nextPageNumber(
  lastPage: readonly unknown[],
  allPages: readonly unknown[],
  size: number = LIST_PAGE_SIZE,
): number | undefined {
  return lastPage.length < size ? undefined : allPages.length;
}

export function flattenPages<T>(data: InfiniteData<readonly T[], number>): T[] {
  return data.pages.flat();
}

export interface ProjectSearchFilters {
  query: string;
  category: string | null;
  city: string;
  skillIds: string[];
  minPaise: number | null;
  maxPaise: number | null;
  takeoverOnly: boolean;
}

export const EMPTY_PROJECT_FILTERS: ProjectSearchFilters = {
  query: '',
  category: null,
  city: '',
  skillIds: [],
  minPaise: null,
  maxPaise: null,
  takeoverOnly: false,
};

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  mine: (userId: string) => [...projectKeys.lists(), 'mine', userId] as const,
  awarded: (userId: string) => [...projectKeys.lists(), 'awarded', userId] as const,
  list: (filters: ProjectSearchFilters) => [...projectKeys.lists(), 'search', filters] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
  skills: (id: string) => [...projectKeys.all, 'skills', id] as const,
  milestones: (id: string) => [...projectKeys.all, 'milestones', id] as const,
  catalogSkills: () => ['skills'] as const,
};

export function useUserId(): string | null {
  return useAuthStore((s) => s.session?.user.id ?? null);
}

export function useSkills() {
  return useQuery({
    queryKey: projectKeys.catalogSkills(),
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<Skill[]> => {
      const { data, error } = await supabase.from('skills').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export interface MyProjects {
  projects: Project[];
  /** Pending proposal count per project id. */
  pendingProposals: Record<string, number>;
}

interface MyProjectsPage {
  projects: Project[];
  pendingProposals: Record<string, number>;
}

function mergeMyProjects(data: InfiniteData<MyProjectsPage, number>): MyProjects {
  const pendingProposals: Record<string, number> = {};
  const projects: Project[] = [];
  for (const page of data.pages) {
    projects.push(...page.projects);
    Object.assign(pendingProposals, page.pendingProposals);
  }
  return { projects, pendingProposals };
}

/**
 * Projects the signed-in user posted, most recently updated first, plus how many proposals
 * await a decision. Paged: call `fetchNextPage` when `hasNextPage`.
 */
export function useMyProjects() {
  const userId = useUserId();
  return useInfiniteQuery({
    queryKey: projectKeys.mine(userId ?? 'anon'),
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MyProjectsPage> => {
      const [from, to] = pageRange(pageParam);
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', userId!)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const openIds = projects.filter((p) => p.status === 'open').map((p) => p.id);
      const pendingProposals: Record<string, number> = {};
      if (openIds.length > 0) {
        const { data: proposals, error: proposalError } = await supabase
          .from('proposals')
          .select('project_id')
          .eq('status', 'pending')
          .in('project_id', openIds);
        if (proposalError) throw proposalError;
        for (const p of proposals) {
          pendingProposals[p.project_id] = (pendingProposals[p.project_id] ?? 0) + 1;
        }
      }
      return { projects, pendingProposals };
    },
    getNextPageParam: (last, all) => nextPageNumber(last.projects, all),
    select: mergeMyProjects,
  });
}

/** The signed-in client's open projects (the only ones that can take invites). */
export function useMyOpenProjects() {
  const userId = useUserId();
  return useQuery({
    queryKey: [...projectKeys.lists(), 'mine-open', userId ?? 'anon'],
    enabled: !!userId,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('client_id', userId!)
        .eq('status', 'open')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

/** Projects where the signed-in user is the awarded freelancer. Paged. */
export function useMyAwardedProjects() {
  const userId = useUserId();
  return useInfiniteQuery({
    queryKey: projectKeys.awarded(userId ?? 'anon'),
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Project[]> => {
      const [from, to] = pageRange(pageParam);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('freelancer_id', userId!)
        .order('awarded_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last, all) => nextPageNumber(last, all),
    select: flattenPages,
  });
}

/** One project by id, or null when it does not exist or is not visible to the user. */
export async function fetchProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () => fetchProject(id!),
  });
}

export function useProjectSkills(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.skills(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<Pick<Skill, 'id' | 'name'>[]> => {
      const { data, error } = await supabase
        .from('project_skills')
        .select('skills(id, name)')
        .eq('project_id', id!);
      if (error) throw error;
      return data.flatMap((row) => (row.skills ? [row.skills] : []));
    },
  });
}

export function useProjectMilestones(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.milestones(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<Milestone[]> => {
      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .eq('project_id', id!)
        .order('position');
      if (error) throw error;
      return data;
    },
  });
}

export interface SaveDraftVars {
  projectId: string | null;
  basics: BasicsDraft;
  settings: SettingsDraft;
  milestones: readonly MilestoneDraft[];
}

function invalidateProject(qc: QueryClient, projectId: string) {
  void qc.invalidateQueries({ queryKey: projectKeys.lists() });
  void qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
  void qc.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
  void qc.invalidateQueries({ queryKey: projectKeys.skills(projectId) });
}

export function useSaveProjectDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SaveDraftVars): Promise<string> => {
      const { data, error } = await supabase.rpc('rpc_save_project_draft', {
        // Omitting p_project_id creates a new draft.
        ...(vars.projectId ? { p_project_id: vars.projectId } : {}),
        p_project: toProjectPayload(vars.basics, vars.settings),
        p_milestones: toDraftMilestones(vars.milestones),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => invalidateProject(qc, id),
  });
}

export function usePublishProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string): Promise<string> => {
      const { error } = await supabase.rpc('rpc_publish_project', { p_project_id: projectId });
      if (error) throw error;
      return projectId;
    },
    onSuccess: (id) => invalidateProject(qc, id),
  });
}

export function useCancelProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { projectId: string; reason: string }): Promise<string> => {
      const { error } = await supabase.rpc('rpc_cancel_project', {
        p_project_id: vars.projectId,
        p_reason: vars.reason,
      });
      if (error) throw error;
      return vars.projectId;
    },
    onSuccess: (id) => {
      invalidateProject(qc, id);
      void qc.invalidateQueries({ queryKey: ['proposals'] });
      void qc.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}

export function useSearchProjects(filters: ProjectSearchFilters) {
  return useInfiniteQuery({
    queryKey: projectKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<SearchProjectRow[]> => {
      const { data, error } = await supabase.rpc('rpc_search_projects', {
        p_query: filters.query.trim() || undefined,
        p_skill_ids: filters.skillIds.length > 0 ? filters.skillIds : undefined,
        p_category: filters.category ?? undefined,
        p_city: filters.city.trim() || undefined,
        p_min_paise: filters.minPaise ?? undefined,
        p_max_paise: filters.maxPaise ?? undefined,
        p_takeover_only: filters.takeoverOnly,
        p_limit: PAGE_SIZE,
        p_cursor: pageParam ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.length < PAGE_SIZE
        ? undefined
        : (lastPage[lastPage.length - 1]?.published_at ?? undefined),
  });
}
