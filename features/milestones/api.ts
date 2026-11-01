import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { projectKeys } from '@/features/projects/api';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type MilestoneRow = Tables<'milestones'>;
export type MilestoneHistory = Tables<'milestone_status_history'>;
export type Submission = Tables<'submissions'>;

export const milestoneKeys = {
  all: ['milestones'] as const,
  detail: (id: string) => [...milestoneKeys.all, 'detail', id] as const,
  history: (id: string) => [...milestoneKeys.all, 'history', id] as const,
  submissions: (id: string) => [...milestoneKeys.all, 'submissions', id] as const,
};

export function useMilestone(id: string | undefined) {
  return useQuery({
    queryKey: milestoneKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<MilestoneRow | null> => {
      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMilestoneHistory(id: string | undefined) {
  return useQuery({
    queryKey: milestoneKeys.history(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<MilestoneHistory[]> => {
      const { data, error } = await supabase
        .from('milestone_status_history')
        .select('*')
        .eq('milestone_id', id!)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useMilestoneSubmissions(id: string | undefined) {
  return useQuery({
    queryKey: milestoneKeys.submissions(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<Submission[]> => {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('milestone_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function invalidateMilestone(qc: QueryClient, milestoneId: string, projectId: string) {
  void qc.invalidateQueries({ queryKey: milestoneKeys.detail(milestoneId) });
  void qc.invalidateQueries({ queryKey: milestoneKeys.history(milestoneId) });
  void qc.invalidateQueries({ queryKey: milestoneKeys.submissions(milestoneId) });
  void qc.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
  void qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
}

interface MilestoneRef {
  milestoneId: string;
  projectId: string;
}

export function useStartMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MilestoneRef) => {
      const { error } = await supabase.rpc('rpc_start_milestone', {
        p_milestone_id: vars.milestoneId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateMilestone(qc, v.milestoneId, v.projectId),
  });
}

export function useSubmitMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MilestoneRef & { note: string; links: string[] }) => {
      const { data, error } = await supabase.rpc('rpc_submit_milestone', {
        p_milestone_id: vars.milestoneId,
        p_note: vars.note.trim(),
        p_links: vars.links,
        p_attachment_paths: [],
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => invalidateMilestone(qc, v.milestoneId, v.projectId),
  });
}

export function useRequestRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MilestoneRef & { note: string }) => {
      const { error } = await supabase.rpc('rpc_request_revision', {
        p_milestone_id: vars.milestoneId,
        p_note: vars.note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateMilestone(qc, v.milestoneId, v.projectId),
  });
}

export function useApproveMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MilestoneRef) => {
      const { error } = await supabase.rpc('rpc_approve_milestone', {
        p_milestone_id: vars.milestoneId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateMilestone(qc, v.milestoneId, v.projectId),
  });
}
