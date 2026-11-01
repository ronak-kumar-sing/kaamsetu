import type { ProposalMilestoneEdit } from './api';

export interface PlanRowView {
  /** The client milestone's id; used to match proposed rows to it (never by position). */
  id?: string;
  title: string;
  amount_paise: number;
  due_date: string;
}

export interface PlanDiffRow {
  position: number;
  current: PlanRowView | null;
  proposed: ProposalMilestoneEdit | null;
  change: 'same' | 'changed' | 'added' | 'removed';
}

/**
 * Compares the client's plan with a freelancer's proposed plan. Proposed rows are matched to
 * client milestones by `source_milestone_id` (D26), in the proposed order; client milestones
 * the proposal leaves out come last as 'removed'.
 */
export function diffPlans(
  current: readonly PlanRowView[],
  proposed: readonly ProposalMilestoneEdit[],
): PlanDiffRow[] {
  const byId = new Map<string, PlanRowView>();
  for (const c of current) if (c.id) byId.set(c.id, c);
  const used = new Set<string>();
  const rows: PlanDiffRow[] = [];

  for (const p of proposed) {
    const match =
      p.source_milestone_id && !used.has(p.source_milestone_id)
        ? (byId.get(p.source_milestone_id) ?? null)
        : null;
    if (match?.id) used.add(match.id);
    let change: PlanDiffRow['change'];
    if (!match) change = 'added';
    else if (
      match.title === p.title &&
      match.amount_paise === p.amount_paise &&
      match.due_date === p.due_date
    ) {
      change = 'same';
    } else change = 'changed';
    rows.push({ position: rows.length + 1, current: match, proposed: p, change });
  }
  for (const c of current) {
    if (c.id && used.has(c.id)) continue;
    rows.push({ position: rows.length + 1, current: c, proposed: null, change: 'removed' });
  }
  return rows;
}

export function planTotal(plan: readonly { amount_paise: number }[]): number {
  return plan.reduce((sum, r) => sum + r.amount_paise, 0);
}

/** True when the proposal's price differs from the project's current total (D26). */
export function priceChanged(proposedTotalPaise: number, currentTotalPaise: number): boolean {
  return proposedTotalPaise !== currentTotalPaise;
}
