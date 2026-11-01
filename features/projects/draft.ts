import type { Milestone, Project, Skill } from './api';
import {
  emptyMilestone,
  paiseToInputText,
  type BasicsDraft,
  type MilestoneDraft,
  type SettingsDraft,
} from './builder';
import type { BuilderInitial } from './components/ProjectBuilder';

/** Rebuilds the builder's form state from a saved draft so it can be edited. */
export function draftToBuilderInitial(
  project: Project,
  milestones: readonly Milestone[],
  skills: readonly Pick<Skill, 'id'>[],
): BuilderInitial {
  const basics: BasicsDraft = {
    title: project.title,
    description: project.description,
    category: project.category,
    skill_ids: skills.map((s) => s.id),
    city: project.city ?? '',
    is_remote: project.is_remote,
    visibility: project.visibility,
  };
  const settings: SettingsDraft = {
    revision_limit: project.revision_limit,
    checkin_cadence_days: project.checkin_cadence_days,
  };
  const rows: MilestoneDraft[] = [...milestones]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      ...emptyMilestone(m.due_date),
      title: m.title,
      deliverable: m.deliverable,
      acceptance_criteria: m.acceptance_criteria,
      amount: m.amount_paise > 0 ? paiseToInputText(m.amount_paise) : '',
    }));
  return {
    projectId: project.id,
    basics,
    settings,
    milestones: rows.length > 0 ? rows : [emptyMilestone(), emptyMilestone()],
  };
}
