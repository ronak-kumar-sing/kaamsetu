import type { BadgeTone } from '@/components/ui';
import type { ProjectStatus } from '@/shared/schemas/projects';

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  open: { label: 'Open', tone: 'info' },
  awarded: { label: 'Awarded', tone: 'primary' },
  in_progress: { label: 'In progress', tone: 'primary' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};
