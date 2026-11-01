import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/store';
import { projectKeys } from '@/features/projects/api';
import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/types/database';

/** Invite row as readable by the app: the secret `token` is excluded from the column grant. */
export type Invite = Omit<Tables<'project_invites'>, 'token'>;
export type InviteStatus = Database['public']['Enums']['invite_status'];
export type ResolvedInvite =
  Database['public']['Functions']['rpc_resolve_invite']['Returns'][number];

/**
 * Columns selectable on `project_invites`. Never include `token`: it is excluded from the
 * column grant, so selecting it (or `*`) fails with 42501. Tokens come only from rpc_create_invite.
 */
export const PROJECT_INVITE_COLUMNS =
  'id, project_id, invited_by, freelancer_id, phone_e164, status, expires_at, responded_at, created_at, updated_at';

export const INVITE_LINK_PREFIX = 'kaamsetu://invite/';

export function inviteLink(token: string): string {
  return `${INVITE_LINK_PREFIX}${token}`;
}

export const inviteKeys = {
  all: ['invites'] as const,
  forProject: (projectId: string) => [...inviteKeys.all, 'project', projectId] as const,
  mine: (userId: string) => [...inviteKeys.all, 'mine', userId] as const,
  token: (token: string) => [...inviteKeys.all, 'token', token] as const,
};

/** Invites on a project (visible to the client who sent them). */
export function useProjectInvites(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: inviteKeys.forProject(projectId ?? ''),
    enabled: !!projectId && enabled,
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('project_invites')
        .select(PROJECT_INVITE_COLUMNS)
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export interface MyInvite extends Invite {
  project: { id: string; title: string; total_paise: number } | null;
}

/** Pending invites addressed to the signed-in user (by profile or verified phone). */
export function useMyInvites() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: inviteKeys.mine(userId ?? 'anon'),
    enabled: !!userId,
    queryFn: async (): Promise<MyInvite[]> => {
      const { data, error } = await supabase
        .from('project_invites')
        .select(`${PROJECT_INVITE_COLUMNS}, project:projects(id, title, total_paise)`)
        .eq('status', 'pending')
        .neq('invited_by', userId!)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useResolveInvite(token: string | undefined) {
  return useQuery({
    queryKey: inviteKeys.token(token ?? ''),
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<ResolvedInvite | null> => {
      const { data, error } = await supabase.rpc('rpc_resolve_invite', { p_token: token! });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

export type InviteTarget =
  { kind: 'profile'; freelancerId: string } | { kind: 'phone'; phone: string } | { kind: 'link' };

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      projectId: string;
      target: InviteTarget;
    }): Promise<{ inviteId: string; token: string }> => {
      const { target } = vars;
      const { data, error } = await supabase.rpc('rpc_create_invite', {
        p_project_id: vars.projectId,
        p_freelancer_id: target.kind === 'profile' ? target.freelancerId : undefined,
        p_phone: target.kind === 'phone' ? target.phone : undefined,
      });
      if (error) throw error;
      const row = data[0];
      if (!row) throw new Error('invite_invalid');
      return { inviteId: row.invite_id, token: row.token };
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: inviteKeys.forProject(vars.projectId) });
    },
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { inviteId: string; projectId: string }) => {
      const { error } = await supabase.rpc('rpc_revoke_invite', { p_invite_id: vars.inviteId });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: inviteKeys.all });
      void qc.invalidateQueries({ queryKey: projectKeys.lists() });
      void qc.invalidateQueries({ queryKey: projectKeys.detail(vars.projectId) });
    },
  });
}

/** Accept or decline, by invite id (inbox) or by link token (deep link). */
export function useRespondInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      inviteId?: string;
      token?: string;
      accept: boolean;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('rpc_respond_invite', {
        p_invite_id: vars.inviteId,
        p_token: vars.token,
        p_accept: vars.accept,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inviteKeys.all });
      void qc.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
