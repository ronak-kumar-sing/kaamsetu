import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { ErrorState, LoadingState } from '@/components/ui';
import { useMyRoles } from '@/features/profiles/api';
import type { AppRole } from '@/shared/constants';

export interface ModeGuardProps {
  role: AppRole;
  children: ReactNode;
}

/** Renders children only when the signed-in user holds `role`; otherwise sends them to `/`. */
export function ModeGuard({ role, children }: ModeGuardProps) {
  const roles = useMyRoles();
  if (roles.isPending) return <LoadingState />;
  if (roles.isError && !roles.data) {
    return (
      <ErrorState message="We couldn't load your account." onRetry={() => void roles.refetch()} />
    );
  }
  if (!roles.data?.includes(role)) return <Redirect href="/" />;
  return <>{children}</>;
}
