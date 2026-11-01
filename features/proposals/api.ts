import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/store';
import { LIST_PAGE_SIZE, flattenPages, nextPageNumber, projectKeys } from '@/features/projects/api';
import { toProposalEdits, type PlanRowDraft } from '@/features/projects/builder';
import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/types/database';

export type Proposal = Tables<'proposals'>;
export type ProposalStatus = Database['public']['Enums']['proposal_status'];
export interface ProposalMilestoneEdit {
  /** The client milestone this row replaces; null for rows the freelancer added. */
  source_milestone_id: string | null;
  title: string;
  amount_paise: number;
  due_date: string;
  deliverable: string | null;
  acceptance_criteria: string | null;
}

export const proposalKeys = {
  all: ['proposals'] as const,
  forProject: (projectId: string) => [...proposalKeys.all, 'project', projectId] as const,
  mine: (userId: string) => [...proposalKeys.all, 'mine', userId] as const,
};

/** Reads the jsonb `milestone_edits` column defensively; returns null when absent or malformed. */
export function parseMilestoneEdits(value: unknown): ProposalMilestoneEdit[] | null {
  if (!Array.isArray(value)) return null;
  const out: ProposalMilestoneEdit[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { title, amount_paise, due_date, source_milestone_id, deliverable, acceptance_criteria } =
      item as Record<string, unknown>;
    if (
      typeof title !== 'string' ||
      typeof amount_paise !== 'number' ||
      typeof due_date !== 'string'
    ) {
      return null;
    }
    out.push({
      source_milestone_id: typeof source_milestone_id === 'string' ? source_milestone_id : null,
      title,
      amount_paise,
      due_date,
      deliverable: typeof deliverable === 'string' ? deliverable : null,
      acceptance_criteria: typeof acceptance_criteria === 'string' ? acceptance_criteria : null,
    });
  }
  return out;
}

/** Proposals on a project (visible to its client). Newest first, paged. */
export function useProjectProposals(projectId: string | undefined, enabled = true) {
  return useInfiniteQuery({
    queryKey: proposalKeys.forProject(projectId ?? ''),
    enabled: !!projectId && enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Proposal[]> => {
      const from = pageParam * LIST_PAGE_SIZE;
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + LIST_PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last, all) => nextPageNumber(last, all),
    select: flattenPages,
  });
}

export interface MyProposal extends Proposal {
  project: {
    id: string;
    title: string;
    status: Database['public']['Enums']['project_status'];
  } | null;
}

/** The signed-in freelancer's own proposals with their project titles. Newest first, paged. */
export function useMyProposals() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useInfiniteQuery({
    queryKey: proposalKeys.mine(userId ?? 'anon'),
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MyProposal[]> => {
      const from = pageParam * LIST_PAGE_SIZE;
      const { data, error } = await supabase
        .from('proposals')
        .select('*, project:projects(id, title, status)')
        .eq('freelancer_id', userId!)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + LIST_PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last, all) => nextPageNumber(last, all),
    select: flattenPages,
  });
}

/** The signed-in freelancer's live (pending or accepted) proposal on one project, if any. */
export function useMyProposalForProject(projectId: string | undefined) {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: [...proposalKeys.all, 'mine-for', userId ?? 'anon', projectId ?? ''],
    enabled: !!userId && !!projectId,
    queryFn: async (): Promise<Proposal | null> => {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('project_id', projectId!)
        .eq('freelancer_id', userId!)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

function invalidateProposals(qc: QueryClient, projectId?: string) {
  void qc.invalidateQueries({ queryKey: proposalKeys.all });
  if (projectId) {
    void qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
  }
  void qc.invalidateQueries({ queryKey: projectKeys.lists() });
}

export interface SubmitProposalVars {
  projectId: string;
  coverNote: string;
  proposedTotalPaise: number;
  timelineDays: number;
  /** null keeps the client's plan. */
  plan: readonly PlanRowDraft[] | null;
}

export function useSubmitProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SubmitProposalVars): Promise<string> => {
      const { data, error } = await supabase.rpc('rpc_submit_proposal', {
        p_project_id: vars.projectId,
        p_cover_note: vars.coverNote.trim(),
        p_proposed_total_paise: vars.proposedTotalPaise,
        p_timeline_days: vars.timelineDays,
        p_milestone_edits: vars.plan ? toProposalEdits(vars.plan) : null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_id, vars) => invalidateProposals(qc, vars.projectId),
  });
}

export function useWithdrawProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string): Promise<void> => {
      const { error } = await supabase.rpc('rpc_withdraw_proposal', { p_proposal_id: proposalId });
      if (error) throw error;
    },
    onSuccess: () => invalidateProposals(qc),
  });
}

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { proposalId: string; projectId: string; reason: string }) => {
      const { error } = await supabase.rpc('rpc_reject_proposal', {
        p_proposal_id: vars.proposalId,
        p_reason: vars.reason,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateProposals(qc, vars.projectId),
  });
}

export function useAcceptProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      proposalId: string;
      projectId: string;
      applyMilestoneEdits: boolean;
    }) => {
      const { error } = await supabase.rpc('rpc_accept_proposal', {
        p_proposal_id: vars.proposalId,
        p_apply_milestone_edits: vars.applyMilestoneEdits,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateProposals(qc, vars.projectId);
      void qc.invalidateQueries({ queryKey: projectKeys.milestones(vars.projectId) });
      void qc.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}
