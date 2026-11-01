import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProjectBuilder, type BuilderInitial } from '../components/ProjectBuilder';
import { emptyMilestone, type MilestoneDraft } from '../builder';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('@/components/motion/testing/reanimatedMock'));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/queryClient', () => ({}));
jest.mock('../api', () => ({
  useSkills: () => ({ isPending: false, isError: false, data: [], refetch: jest.fn() }),
  useSaveProjectDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePublishProject: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

function row(overrides: Partial<MilestoneDraft> = {}): MilestoneDraft {
  return {
    ...emptyMilestone(),
    title: 'First draft',
    deliverable: 'Screens delivered as Figma files',
    acceptance_criteria: 'Client signs off on every screen',
    amount: '5000',
    due_date: '2999-12-01',
    ...overrides,
  };
}

function initial(milestones: MilestoneDraft[]): BuilderInitial {
  return {
    projectId: null,
    basics: {
      title: 'Logo and brand kit',
      description: 'We need a logo, colours and typography for a small bakery in Pune.',
      category: 'Design & Creative',
      skill_ids: [],
      city: '',
      is_remote: true,
      visibility: 'public',
    },
    settings: { revision_limit: 2, checkin_cadence_days: 2 },
    milestones,
  };
}

describe('ProjectBuilder milestone step', () => {
  it('lowers the per-milestone cap as milestones are added', async () => {
    await render(
      <ProjectBuilder
        initial={initial([row(), row()])}
        initialStep="milestones"
        onFinished={jest.fn()}
      />,
    );
    expect(screen.getByText('Max per milestone: 60% (2 milestones)')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Add milestone' }));
    expect(screen.getByText('Max per milestone: 40% (3 milestones)')).toBeTruthy();
    expect(screen.queryByText('Max per milestone: 60% (2 milestones)')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Add milestone' }));
    expect(screen.getByText('Max per milestone: 30% (4 milestones)')).toBeTruthy();
  });

  it('reorders and removes milestones', async () => {
    await render(
      <ProjectBuilder
        initial={initial([row({ title: 'Alpha' }), row({ title: 'Beta' })])}
        initialStep="milestones"
        onFinished={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Move milestone 1 up' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove milestone 1' }));
    expect(screen.queryByDisplayValue('Alpha')).toBeNull();
    expect(screen.getByDisplayValue('Beta')).toBeTruthy();
  });

  it('keeps Publish disabled while the plan breaks a rule', async () => {
    // 3 milestones, one holds 50% of the total: above the 40% cap.
    await render(
      <ProjectBuilder
        initial={initial([
          row({ amount: '5000' }),
          row({ amount: '2500' }),
          row({ amount: '2500' }),
        ])}
        initialStep="review"
        onFinished={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(
      screen.getByText(/Milestone 1 is 50% of the total; the most allowed is 40%/),
    ).toBeTruthy();
  });

  it('enables Publish for a valid plan', async () => {
    await render(
      <ProjectBuilder
        initial={initial([row(), row(), row({ amount: '5000' })])}
        initialStep="review"
        onFinished={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  });
});
