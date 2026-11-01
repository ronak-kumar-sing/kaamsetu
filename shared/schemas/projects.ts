import { z } from 'zod';

import {
  DEFAULT_CHECKIN_CADENCE_DAYS,
  DEFAULT_REVISION_LIMIT,
  MAX_MILESTONE_PCT,
  MILESTONE_CAP_SLACK_PCT,
  MIN_MILESTONES,
} from '../constants';

// Mirrors the server rules in rpc_save_project_draft / rpc_publish_project. The database is
// authoritative; these give instant feedback in the app.

export const MILESTONE_STATUSES = [
  'draft',
  'funded',
  'in_progress',
  'submitted',
  'revision_requested',
  'approved',
  'released',
  'disputed',
  'refunded',
  'partially_released',
  'abandoned',
  'reassigned',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const PROJECT_STATUSES = [
  'draft',
  'open',
  'awarded',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_VISIBILITIES = ['public', 'invite_only'] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

export const PROPOSAL_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'] as const;
export const INVITE_STATUSES = ['pending', 'accepted', 'declined', 'revoked', 'expired'] as const;

const MAX_AMOUNT_PAISE = 1_00_00_000_00; // ₹1 crore per milestone

/** YYYY-MM-DD in the user's calendar. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(3, 'Give the milestone a title').max(120),
  deliverable: z.string().trim().min(10, 'Describe what will be delivered').max(2000),
  acceptance_criteria: z.string().trim().min(10, 'How will you judge it done?').max(2000),
  amount_paise: z.number().int().min(100_00, 'At least ₹100').max(MAX_AMOUNT_PAISE),
  due_date: isoDateSchema,
});
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

export type MilestoneIssue =
  | { kind: 'too_few'; min: number }
  | { kind: 'over_cap'; index: number; pct: number; max: number }
  | { kind: 'date_order'; index: number }
  | { kind: 'date_past'; index: number };

/** Highest share (%) any one milestone may take, given how many milestones there are. */
export function milestoneCapPct(
  count: number,
  maxPct: number = MAX_MILESTONE_PCT,
  slackPct: number = MILESTONE_CAP_SLACK_PCT,
): number {
  if (count <= 0) return 100;
  return Math.min(100, Math.max(maxPct, Math.ceil(slackPct / count)));
}

/**
 * Cross-milestone rules: at least MIN_MILESTONES, none above `milestoneCapPct(count)` of the
 * total, due dates strictly in the future and non-decreasing in order.
 */
export function milestoneIssues(
  milestones: readonly Pick<MilestoneInput, 'amount_paise' | 'due_date'>[],
  today: string,
  {
    maxPct = MAX_MILESTONE_PCT,
    slackPct = MILESTONE_CAP_SLACK_PCT,
    minCount = MIN_MILESTONES,
  } = {},
): MilestoneIssue[] {
  const issues: MilestoneIssue[] = [];
  if (milestones.length < minCount) issues.push({ kind: 'too_few', min: minCount });
  const cap = milestoneCapPct(milestones.length, maxPct, slackPct);
  const total = milestones.reduce((sum, m) => sum + m.amount_paise, 0);
  milestones.forEach((m, index) => {
    // Integer comparison: amount * 100 > total * cap  ⇔  amount/total > cap%.
    if (total > 0 && m.amount_paise * 100 > total * cap) {
      issues.push({
        kind: 'over_cap',
        index,
        pct: Math.ceil((m.amount_paise * 100) / total),
        max: cap,
      });
    }
    if (m.due_date <= today) issues.push({ kind: 'date_past', index });
    const prev = milestones[index - 1];
    if (prev && m.due_date < prev.due_date) issues.push({ kind: 'date_order', index });
  });
  return issues;
}

export const projectDraftSchema = z.object({
  title: z.string().trim().min(5, 'Give your project a clear title').max(120),
  description: z.string().trim().min(30, 'Describe the work in at least a few sentences').max(5000),
  category: z.string().trim().min(2).max(60),
  skill_ids: z.array(z.uuid()).max(10).default([]),
  city: z.string().trim().max(60).optional().or(z.literal('')),
  is_remote: z.boolean().default(true),
  visibility: z.enum(PROJECT_VISIBILITIES).default('public'),
  checkin_cadence_days: z.number().int().min(1).max(14).default(DEFAULT_CHECKIN_CADENCE_DAYS),
  revision_limit: z.number().int().min(0).max(5).default(DEFAULT_REVISION_LIMIT),
  milestones: z.array(milestoneInputSchema).min(1).max(20),
});
export type ProjectDraftInput = z.input<typeof projectDraftSchema>;
export type ProjectDraft = z.output<typeof projectDraftSchema>;

/**
 * One row of a freelancer's counter-plan. Rows that replace a client milestone reference it by
 * `source_milestone_id` and inherit its deliverable and acceptance criteria; new rows must
 * supply their own.
 */
export const proposalMilestoneEditSchema = z
  .object({
    source_milestone_id: z.uuid().nullable().default(null),
    title: z.string().trim().min(3).max(120),
    amount_paise: z.number().int().min(100_00).max(MAX_AMOUNT_PAISE),
    due_date: isoDateSchema,
    deliverable: z.string().trim().min(10).max(2000).nullable().default(null),
    acceptance_criteria: z.string().trim().min(10).max(2000).nullable().default(null),
  })
  .refine(
    (m) =>
      m.source_milestone_id !== null || (m.deliverable !== null && m.acceptance_criteria !== null),
    {
      message: 'New milestones need a deliverable and acceptance criteria',
      path: ['deliverable'],
    },
  );
export type ProposalMilestoneEdit = z.output<typeof proposalMilestoneEditSchema>;

/**
 * A proposal's price is the sum of its milestones (D26): with a counter-plan the plan must add
 * up to `proposed_total_paise`; without one the price must equal the project's current total.
 */
export function proposalPriceIssue(
  proposedTotalPaise: number,
  projectTotalPaise: number,
  edits: readonly Pick<ProposalMilestoneEdit, 'amount_paise'>[] | null,
): 'plan_total_mismatch' | 'price_change_needs_plan' | null {
  if (edits && edits.length > 0) {
    const sum = edits.reduce((acc, e) => acc + e.amount_paise, 0);
    return sum === proposedTotalPaise ? null : 'plan_total_mismatch';
  }
  return proposedTotalPaise === projectTotalPaise ? null : 'price_change_needs_plan';
}

export const proposalSchema = z.object({
  cover_note: z.string().trim().min(30, 'Tell the client why you are a good fit').max(3000),
  proposed_total_paise: z
    .number()
    .int()
    .min(100_00)
    .max(20 * MAX_AMOUNT_PAISE),
  timeline_days: z.number().int().min(1).max(365),
  /** Optional counter-plan; must pass `milestoneIssues` and `proposalPriceIssue`. */
  milestone_edits: z.array(proposalMilestoneEditSchema).max(20).nullable().default(null),
});
export type ProposalInput = z.input<typeof proposalSchema>;

/** Invites are only possible while a project is `open` (D27). */
export const inviteSchema = z.union([
  z.object({ kind: z.literal('profile'), freelancer_id: z.uuid() }),
  z.object({ kind: z.literal('phone'), phone: z.string().regex(/^\+91[6-9]\d{9}$/) }),
  z.object({ kind: z.literal('link') }),
]);
export type InviteInput = z.infer<typeof inviteSchema>;
