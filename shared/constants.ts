// Business rules shared by the app and edge functions. The database holds the
// authoritative copies in `app_config`; these mirror the defaults for client-side
// validation and copy.

export const MAX_MILESTONE_PCT = 30;
/**
 * Small projects can't meet a flat 30% cap (2 milestones force ≥ 50%), so the cap scales:
 * cap = max(MAX_MILESTONE_PCT, ceil(MILESTONE_CAP_SLACK_PCT / count)) → 2: 60%, 3: 40%, 4+: 30%.
 */
export const MILESTONE_CAP_SLACK_PCT = 120;
export const MIN_MILESTONES = 2;
export const AUTO_APPROVE_DAYS = 5;
export const DEFAULT_REVISION_LIMIT = 2;
export const DEFAULT_CHECKIN_CADENCE_DAYS = 2;
export const DEPOSIT_THRESHOLD_PAISE = 20_000_00;
export const DEPOSIT_PCT = 5;
export const DEPOSIT_CAP_PAISE = 5_000_00;
export const DEPOSIT_FORFEIT_PLATFORM_FEE_PCT = 10;
export const DEPOSIT_EXEMPT_MIN_SCORE = 85;
export const DEPOSIT_EXEMPT_MIN_PROJECTS = 5;
export const RELIABILITY_NEW_USER_MIN_COMPLETED = 2;

export const APP_ROLES = ['client', 'freelancer', 'admin'] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Roles a user may grant themselves during onboarding. `admin` is granted only in SQL. */
export const SELF_ASSIGNABLE_ROLES = ['client', 'freelancer'] as const;
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export const AVAILABILITY_STATUSES = ['available', 'busy', 'unavailable'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];
