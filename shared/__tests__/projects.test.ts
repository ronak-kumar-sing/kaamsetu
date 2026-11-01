import {
  milestoneCapPct,
  milestoneIssues,
  projectDraftSchema,
  proposalMilestoneEditSchema,
  proposalPriceIssue,
} from '../schemas/projects';

const TODAY = '2026-11-01';
const m = (amount_paise: number, due_date: string) => ({ amount_paise, due_date });

describe('milestoneIssues', () => {
  it('accepts a valid 4-way split', () => {
    const plan = [
      m(25_000_00, '2026-11-10'),
      m(25_000_00, '2026-11-20'),
      m(25_000_00, '2026-12-01'),
      m(25_000_00, '2026-12-10'),
    ];
    expect(milestoneIssues(plan, TODAY)).toEqual([]);
  });

  it('requires at least two milestones', () => {
    expect(milestoneIssues([m(1_000_00, '2026-11-10')], TODAY)).toContainEqual({
      kind: 'too_few',
      min: 2,
    });
  });

  it('allows a 60/40 split for two milestones but not 61/39', () => {
    expect(milestoneIssues([m(6_000_00, '2026-11-10'), m(4_000_00, '2026-11-20')], TODAY)).toEqual(
      [],
    );
    expect(
      milestoneIssues([m(6_100_00, '2026-11-10'), m(3_900_00, '2026-11-20')], TODAY),
    ).toContainEqual(expect.objectContaining({ kind: 'over_cap', index: 0, max: 60 }));
  });

  it('caps four or more milestones at 30%, using integer maths at the boundary', () => {
    const exact = [
      m(30_00, '2026-11-10'),
      m(30_00, '2026-11-11'),
      m(20_00, '2026-11-12'),
      m(20_00, '2026-11-13'),
    ];
    expect(milestoneIssues(exact, TODAY)).toEqual([]);
    const over = [
      m(3_000_01, '2026-11-10'),
      m(2_333_33, '2026-11-11'),
      m(2_333_33, '2026-11-12'),
      m(2_333_33, '2026-11-13'),
    ];
    expect(milestoneIssues(over, TODAY)).toContainEqual(
      expect.objectContaining({ kind: 'over_cap', index: 0, max: 30 }),
    );
  });

  it('flags past and out-of-order dates', () => {
    const plan = [
      m(1_000_00, '2026-11-01'),
      m(1_000_00, '2026-12-01'),
      m(1_000_00, '2026-11-15'),
      m(1_000_00, '2026-12-20'),
    ];
    const issues = milestoneIssues(plan, TODAY);
    expect(issues).toContainEqual({ kind: 'date_past', index: 0 });
    expect(issues).toContainEqual({ kind: 'date_order', index: 2 });
  });
});

describe('milestoneCapPct', () => {
  it.each([
    [1, 100],
    [2, 60],
    [3, 40],
    [4, 30],
    [5, 30],
    [10, 30],
  ])('%p milestones → %p%%', (count, cap) => {
    expect(milestoneCapPct(count)).toBe(cap);
  });
});

describe('projectDraftSchema', () => {
  it('applies defaults', () => {
    const parsed = projectDraftSchema.parse({
      title: 'Logo and brand kit',
      description: 'We need a logo, colour palette and social templates for our bakery.',
      category: 'design',
      milestones: [
        {
          title: 'Concepts',
          deliverable: 'Three logo concepts',
          acceptance_criteria: 'Client picks one concept',
          amount_paise: 5_000_00,
          due_date: '2026-11-10',
        },
      ],
    });
    expect(parsed).toMatchObject({
      visibility: 'public',
      is_remote: true,
      revision_limit: 2,
      checkin_cadence_days: 2,
    });
  });
});

describe('proposalPriceIssue', () => {
  it('accepts the project price without a plan', () => {
    expect(proposalPriceIssue(1_00_000_00, 1_00_000_00, null)).toBeNull();
  });

  it('requires a plan to change the price', () => {
    expect(proposalPriceIssue(90_000_00, 1_00_000_00, null)).toBe('price_change_needs_plan');
    expect(proposalPriceIssue(90_000_00, 1_00_000_00, [])).toBe('price_change_needs_plan');
  });

  it('requires the plan to add up to the price', () => {
    const plan = [{ amount_paise: 50_000_00 }, { amount_paise: 50_000_00 }];
    expect(proposalPriceIssue(1_00_000_00, 1_00_000_00, plan)).toBeNull();
    expect(proposalPriceIssue(100_00, 1_00_000_00, plan)).toBe('plan_total_mismatch');
  });
});

describe('proposalMilestoneEditSchema', () => {
  it('lets rows that replace a client milestone inherit its texts', () => {
    const row = {
      source_milestone_id: '6f1c2c7e-6c1e-4d8a-9b1a-2f3e4d5c6b7a',
      title: 'Design',
      amount_paise: 10_000_00,
      due_date: '2026-12-01',
    };
    expect(proposalMilestoneEditSchema.safeParse(row).success).toBe(true);
  });

  it('requires texts for brand-new rows', () => {
    const row = { title: 'Extra QA pass', amount_paise: 10_000_00, due_date: '2026-12-01' };
    expect(proposalMilestoneEditSchema.safeParse(row).success).toBe(false);
    expect(
      proposalMilestoneEditSchema.safeParse({
        ...row,
        deliverable: 'Full regression test report',
        acceptance_criteria: 'No open P1 bugs at handover',
      }).success,
    ).toBe(true);
  });
});
