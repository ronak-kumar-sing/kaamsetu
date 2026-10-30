import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/store';
import { supabase } from '@/lib/supabase';
import type { AppRole, SelfAssignableRole } from '@/shared/constants';
import type { ProfileSetupValues } from '@/shared/schemas/identity';
import type { Tables, TablesUpdate } from '@/types/database';

export type Profile = Tables<'profiles'>;
export type EditableProfile = Pick<
  TablesUpdate<'profiles'>,
  | 'full_name'
  | 'avatar_path'
  | 'headline'
  | 'bio'
  | 'city'
  | 'languages'
  | 'hourly_rate_paise'
  | 'availability'
>;

export const profileKeys = {
  me: (userId: string) => ['profiles', 'me', userId] as const,
  roles: (userId: string) => ['profiles', 'roles', userId] as const,
  detail: (id: string) => ['profiles', 'detail', id] as const,
};

/**
 * Columns readable through the profiles SELECT grant. `phone`, `email` and `is_flagged`
 * are column-protected and come from `get_profile_private` (owner/admin only).
 */
const PROFILE_PUBLIC_COLUMNS =
  'id, full_name, avatar_path, headline, bio, city, languages, hourly_rate_paise, availability, phone_verified, email_verified, kyc_verified, portfolio_verified, onboarding_completed_at, created_at, updated_at';

function useUserId(): string | null {
  return useAuthStore((s) => s.session?.user.id ?? null);
}

export function useMyProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: profileKeys.me(userId ?? 'anon'),
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const [publicRes, privateRes] = await Promise.all([
        supabase.from('profiles').select(PROFILE_PUBLIC_COLUMNS).eq('id', userId!).maybeSingle(),
        supabase.rpc('get_profile_private', { p_user_id: userId! }),
      ]);
      if (publicRes.error) throw publicRes.error;
      if (privateRes.error) throw privateRes.error;
      if (!publicRes.data) return null;
      const priv = privateRes.data[0];
      return {
        ...publicRes.data,
        phone: priv?.phone ?? null,
        email: priv?.email ?? null,
        is_flagged: priv?.is_flagged ?? false,
      };
    },
  });
}

export function useMyRoles() {
  const userId = useUserId();
  return useQuery({
    queryKey: profileKeys.roles(userId ?? 'anon'),
    enabled: !!userId,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId!);
      if (error) throw error;
      return data.map((r) => r.role);
    },
  });
}

export function useUpdateMyProfile() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: EditableProfile) => {
      if (!userId) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select(PROFILE_PUBLIC_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => {
      if (!userId) return;
      // Keep the private fields already in the cache; the update can't return them.
      qc.setQueryData<Profile | null>(profileKeys.me(userId), (prev) =>
        prev ? { ...prev, ...updated } : prev,
      );
    },
  });
}

export function useSaveProfileSetup() {
  const update = useUpdateMyProfile();
  return {
    ...update,
    mutateAsync: (values: ProfileSetupValues) =>
      update.mutateAsync({
        full_name: values.full_name,
        city: values.city,
        headline: values.headline || null,
        bio: values.bio || null,
        languages: values.languages,
      }),
  };
}

export function useSetMyRoles() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roles: SelfAssignableRole[]) => {
      const { error } = await supabase.rpc('rpc_set_my_roles', { p_roles: roles });
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) void qc.invalidateQueries({ queryKey: profileKeys.roles(userId) });
    },
  });
}

export function useCompleteOnboarding() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('rpc_complete_onboarding');
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) void qc.invalidateQueries({ queryKey: profileKeys.me(userId) });
    },
  });
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
