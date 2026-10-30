import type { AppRole } from '@/shared/constants';

export const MODE_HOME = {
  client: '/client',
  freelancer: '/freelancer',
  admin: '/admin',
} as const satisfies Record<AppRole, string>;

/** Picks the mode to open: the saved one if the user still has that role, else a sensible default. */
export function resolveMode(roles: readonly AppRole[], saved: AppRole | null): AppRole | null {
  if (saved && roles.includes(saved)) return saved;
  if (roles.includes('client')) return 'client';
  if (roles.includes('freelancer')) return 'freelancer';
  if (roles.includes('admin')) return 'admin';
  return null;
}

export const MODE_LABEL: Record<AppRole, string> = {
  client: 'Hiring (client)',
  freelancer: 'Working (freelancer)',
  admin: 'Admin',
};
