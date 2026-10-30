import { Badge, type BadgeTone } from './Badge';

export type MilestoneStatus =
  | 'draft'
  | 'funded'
  | 'in_progress'
  | 'submitted'
  | 'revision_requested'
  | 'approved'
  | 'released'
  | 'disputed'
  | 'refunded'
  | 'partially_released'
  | 'abandoned'
  | 'reassigned';

export const MILESTONE_STATUS_META: Record<MilestoneStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  funded: { label: 'Funded', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'primary' },
  submitted: { label: 'Submitted', tone: 'warning' },
  revision_requested: { label: 'Revision requested', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  released: { label: 'Released', tone: 'success' },
  disputed: { label: 'Disputed', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  partially_released: { label: 'Partially released', tone: 'info' },
  abandoned: { label: 'Abandoned', tone: 'danger' },
  reassigned: { label: 'Reassigned', tone: 'neutral' },
};

export interface StatusChipProps {
  status: MilestoneStatus;
}

export function StatusChip({ status }: StatusChipProps) {
  const meta = MILESTONE_STATUS_META[status];
  return <Badge label={meta.label} tone={meta.tone} />;
}
