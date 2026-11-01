// Pure logic behind the project builder and the proposal plan editor: no React, no network.
import { formatINR, rupeeInputToPaise } from '@/shared/money';
import {
  milestoneCapPct,
  milestoneInputSchema,
  milestoneIssues,
  projectDraftSchema,
  proposalMilestoneEditSchema,
  type MilestoneInput,
  type MilestoneIssue,
  type ProjectVisibility,
} from '@/shared/schemas/projects';
import { DEFAULT_CHECKIN_CADENCE_DAYS, DEFAULT_REVISION_LIMIT } from '@/shared/constants';

import { isValidIsoDate } from './format';

export const MAX_MILESTONES = 20;
export const MAX_SKILLS = 10;

/** One editable milestone row. Amount is the raw rupee text the user typed. */
export interface MilestoneDraft {
  key: string;
  title: string;
  deliverable: string;
  acceptance_criteria: string;
  amount: string;
  due_date: string;
}

/**
 * A row in a proposed plan. Rows that replace a client milestone carry its id in
 * `source_milestone_id` and inherit its deliverable and criteria (kept here for display only);
 * new rows (`source_milestone_id` null) must supply their own.
 */
export interface PlanRowDraft {
  key: string;
  source_milestone_id: string | null;
  title: string;
  amount: string;
  due_date: string;
  deliverable: string;
  acceptance_criteria: string;
}

/** The client's milestone fields a plan row can be seeded from. */
export interface SourceMilestone {
  id: string;
  title: string;
  amount_paise: number;
  due_date: string;
  deliverable: string;
  acceptance_criteria: string;
}

export interface BasicsDraft {
  title: string;
  description: string;
  category: string;
  skill_ids: string[];
  city: string;
  is_remote: boolean;
  visibility: ProjectVisibility;
}

export interface SettingsDraft {
  revision_limit: number;
  checkin_cadence_days: number;
}

export const EMPTY_BASICS: BasicsDraft = {
  title: '',
  description: '',
  category: '',
  skill_ids: [],
  city: '',
  is_remote: true,
  visibility: 'public',
};

export const DEFAULT_SETTINGS: SettingsDraft = {
  revision_limit: DEFAULT_REVISION_LIMIT,
  checkin_cadence_days: DEFAULT_CHECKIN_CADENCE_DAYS,
};

let keyCounter = 0;
export function newRowKey(): string {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

export function emptyMilestone(dueDate = ''): MilestoneDraft {
  return {
    key: newRowKey(),
    title: '',
    deliverable: '',
    acceptance_criteria: '',
    amount: '',
    due_date: dueDate,
  };
}

/** A brand-new plan row (no source milestone); it needs its own deliverable and criteria. */
export function emptyPlanRow(dueDate = ''): PlanRowDraft {
  return {
    key: newRowKey(),
    source_milestone_id: null,
    title: '',
    amount: '',
    due_date: dueDate,
    deliverable: '',
    acceptance_criteria: '',
  };
}

/** A plan row that replaces one of the client's milestones, prefilled from it. */
export function planRowFromMilestone(m: SourceMilestone): PlanRowDraft {
  return {
    key: newRowKey(),
    source_milestone_id: m.id,
    title: m.title,
    amount: paiseToInputText(m.amount_paise),
    due_date: m.due_date,
    deliverable: m.deliverable,
    acceptance_criteria: m.acceptance_criteria,
  };
}

/** Appends a row built by `make`, carrying the previous due date forward as a starting point. */
export function addRow<T extends { due_date: string }>(
  rows: readonly T[],
  make: (dueDate: string) => T,
  max: number = MAX_MILESTONES,
): T[] {
  if (rows.length >= max) return [...rows];
  const last = rows[rows.length - 1];
  return [...rows, make(last?.due_date ?? '')];
}

export function removeRow<T extends { key: string }>(rows: readonly T[], key: string): T[] {
  return rows.filter((r) => r.key !== key);
}

/** Moves a row one place up (-1) or down (+1). No-op at the ends. */
export function moveRow<T extends { key: string }>(
  rows: readonly T[],
  key: string,
  direction: -1 | 1,
): T[] {
  const index = rows.findIndex((r) => r.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  const [moved] = next.splice(index, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}

export function updateRow<T extends { key: string }>(
  rows: readonly T[],
  key: string,
  patch: Partial<T>,
): T[] {
  return rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
}

/** Rupee text → paise; null when blank/invalid. */
export function amountToPaise(amount: string): number | null {
  if (amount.trim() === '') return null;
  return rupeeInputToPaise(amount);
}

export function totalPaise(rows: readonly { amount: string }[]): number {
  return rows.reduce((sum, r) => sum + (amountToPaise(r.amount) ?? 0), 0);
}

/** Each row's share of the total as a whole percentage (0 when the total is 0). */
export function sharePct(rows: readonly { amount: string }[], index: number): number {
  const total = totalPaise(rows);
  const row = rows[index];
  if (!row || total === 0) return 0;
  return Math.round(((amountToPaise(row.amount) ?? 0) * 100) / total);
}

export function capLabel(count: number): string {
  const noun = count === 1 ? 'milestone' : 'milestones';
  return `Max per milestone: ${milestoneCapPct(count)}% (${count} ${noun})`;
}

type Plan = readonly { amount: string; due_date: string }[];

/** Cross-row rules (count, cap, date order) from the shared module, on parsed values. */
export function planIssues(rows: Plan, today: string): MilestoneIssue[] {
  return milestoneIssues(
    rows.map((r) => ({
      amount_paise: amountToPaise(r.amount) ?? 0,
      due_date: isValidIsoDate(r.due_date) ? r.due_date : '',
    })),
    today,
  );
}

export function describeIssue(issue: MilestoneIssue): string {
  switch (issue.kind) {
    case 'too_few':
      return `Add at least ${issue.min} milestones.`;
    case 'over_cap':
      return `Milestone ${issue.index + 1} is ${issue.pct}% of the total; the most allowed is ${issue.max}%.`;
    case 'date_order':
      return `Milestone ${issue.index + 1} is due before the one above it.`;
    case 'date_past':
      return `Milestone ${issue.index + 1} needs a due date after today.`;
  }
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

function collect<K extends string>(
  issues: readonly { path: PropertyKey[]; message: string }[],
): FieldErrors<K> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out as FieldErrors<K>;
}

function candidate(m: MilestoneDraft): Record<string, unknown> {
  return {
    title: m.title,
    deliverable: m.deliverable,
    acceptance_criteria: m.acceptance_criteria,
    amount_paise: amountToPaise(m.amount) ?? Number.NaN,
    due_date: isValidIsoDate(m.due_date) ? m.due_date : '',
  };
}

export type MilestoneField = keyof MilestoneInput;

export function milestoneFieldErrors(m: MilestoneDraft): FieldErrors<MilestoneField> {
  const parsed = milestoneInputSchema.safeParse(candidate(m));
  const errors = parsed.success ? {} : collect<MilestoneField>(parsed.error.issues);
  if (amountToPaise(m.amount) === null) {
    errors.amount_paise =
      m.amount.trim() === '' ? 'Enter an amount' : 'Enter a valid amount, e.g. 5000';
  }
  if (!isValidIsoDate(m.due_date)) errors.due_date = 'Use the format YYYY-MM-DD';
  return errors;
}

export type PlanField =
  'title' | 'amount_paise' | 'due_date' | 'deliverable' | 'acceptance_criteria';

export function planRowFieldErrors(r: PlanRowDraft): FieldErrors<PlanField> {
  const parsed = proposalMilestoneEditSchema.safeParse({
    source_milestone_id: r.source_milestone_id,
    title: r.title,
    amount_paise: amountToPaise(r.amount) ?? Number.NaN,
    due_date: isValidIsoDate(r.due_date) ? r.due_date : '',
    deliverable: r.source_milestone_id ? null : r.deliverable,
    acceptance_criteria: r.source_milestone_id ? null : r.acceptance_criteria,
  });
  const errors = parsed.success ? {} : collect<PlanField>(parsed.error.issues);
  if (!r.source_milestone_id) {
    if (r.deliverable.trim().length < 10) errors.deliverable = 'Describe what will be delivered';
    else delete errors.deliverable;
    if (r.acceptance_criteria.trim().length < 10) {
      errors.acceptance_criteria = 'How will the client judge it done?';
    }
  }
  if (amountToPaise(r.amount) === null) {
    errors.amount_paise = r.amount.trim() === '' ? 'Enter an amount' : 'Enter a valid amount';
  }
  if (!isValidIsoDate(r.due_date)) errors.due_date = 'Use the format YYYY-MM-DD';
  return errors;
}

export type BasicsField = 'title' | 'description' | 'category' | 'city' | 'skill_ids';

export function basicsFieldErrors(basics: BasicsDraft): FieldErrors<BasicsField> {
  const parsed = projectDraftSchema.omit({ milestones: true }).safeParse(basics);
  const errors = parsed.success ? {} : collect<BasicsField>(parsed.error.issues);
  if (!basics.is_remote && basics.city.trim().length < 2) {
    errors.city = 'Enter the city, or mark the work as remote';
  }
  return errors;
}

export interface BuilderValidation {
  basics: FieldErrors<BasicsField>;
  milestones: Record<string, FieldErrors<MilestoneField>>;
  issues: MilestoneIssue[];
  /** True when the whole project can be published. */
  publishable: boolean;
  /** True when the draft can be saved (field bounds only; cap and date rules wait for publish). */
  savable: boolean;
}

export function validateBuilder(
  basics: BasicsDraft,
  milestones: readonly MilestoneDraft[],
  today: string,
): BuilderValidation {
  const basicsErrors = basicsFieldErrors(basics);
  const perMilestone: Record<string, FieldErrors<MilestoneField>> = {};
  for (const m of milestones) {
    const errors = milestoneFieldErrors(m);
    if (Object.keys(errors).length > 0) perMilestone[m.key] = errors;
  }
  const issues = planIssues(milestones, today);
  const basicsOk = Object.keys(basicsErrors).length === 0;
  return {
    basics: basicsErrors,
    milestones: perMilestone,
    issues,
    publishable: basicsOk && Object.keys(perMilestone).length === 0 && issues.length === 0,
    // The server validates every field on draft saves too; only the cross-milestone rules
    // (count, cap, date order) wait until publish.
    savable: basicsOk && Object.keys(perMilestone).length === 0 && milestones.length > 0,
  };
}

/** Milestones for a draft save: loose, because drafts may be incomplete. */
export function toDraftMilestones(rows: readonly MilestoneDraft[]) {
  return rows.map((m) => ({
    title: m.title.trim(),
    deliverable: m.deliverable.trim(),
    acceptance_criteria: m.acceptance_criteria.trim(),
    amount_paise: amountToPaise(m.amount) ?? 0,
    due_date: m.due_date,
  }));
}

export function toProjectPayload(basics: BasicsDraft, settings: SettingsDraft) {
  return {
    title: basics.title.trim(),
    description: basics.description.trim(),
    category: basics.category,
    skill_ids: basics.skill_ids,
    city: basics.city.trim() || null,
    is_remote: basics.is_remote,
    visibility: basics.visibility,
    checkin_cadence_days: settings.checkin_cadence_days,
    revision_limit: settings.revision_limit,
  };
}

/**
 * The full set of plan rows for rpc_submit_proposal. Source rows send `null` text so they inherit
 * the client's deliverable and criteria; new rows send their own.
 */
export function toProposalEdits(rows: readonly PlanRowDraft[]) {
  return rows.map((r) => ({
    source_milestone_id: r.source_milestone_id,
    title: r.title.trim(),
    amount_paise: amountToPaise(r.amount) ?? 0,
    due_date: r.due_date,
    deliverable: r.source_milestone_id ? null : r.deliverable.trim(),
    acceptance_criteria: r.source_milestone_id ? null : r.acceptance_criteria.trim(),
  }));
}

/** Copy for a D26 price/plan disagreement, with the numbers the freelancer needs. */
export function describePriceIssue(
  issue: 'plan_total_mismatch' | 'price_change_needs_plan',
  planTotalPaise: number,
  pricePaise: number,
  projectTotalPaise: number,
): string {
  if (issue === 'plan_total_mismatch') {
    return `Your plan adds up to ${formatINR(planTotalPaise)} but your price is ${formatINR(pricePaise)}. Make them match.`;
  }
  return `Your price differs from the client's ${formatINR(projectTotalPaise)}. Suggest a milestone plan that adds up to your price.`;
}

/** Paise → the plain rupee text the amount field expects: 1250050 → "12500.5". */
export function paiseToInputText(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const fraction = paise % 100;
  if (fraction === 0) return String(rupees);
  return `${rupees}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}
