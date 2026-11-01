import {
  addRow,
  amountToPaise,
  basicsFieldErrors,
  capLabel,
  describeIssue,
  emptyMilestone,
  moveRow,
  paiseToInputText,
  planIssues,
  removeRow,
  sharePct,
  totalPaise,
  updateRow,
  validateBuilder,
  type BasicsDraft,
  type MilestoneDraft,
} from '../builder';

const TODAY = '2026-11-01';

function milestone(overrides: Partial<MilestoneDraft> = {}): MilestoneDraft {
  return {
    ...emptyMilestone(),
    title: 'Design mockups',
    deliverable: 'All screens as Figma files',
    acceptance_criteria: 'Client signs off on every screen',
    amount: '5000',
    due_date: '2026-12-01',
    ...overrides,
  };
}

const BASICS: BasicsDraft = {
  title: 'Logo and brand kit',
  description: 'We need a logo, colours and typography for a small bakery in Pune.',
  category: 'Design & Creative',
  skill_ids: [],
  city: '',
  is_remote: true,
  visibility: 'public',
};

describe('row helpers', () => {
  it('adds a row carrying the previous due date', () => {
    const rows = addRow([milestone({ due_date: '2026-12-05' })], emptyMilestone);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.due_date).toBe('2026-12-05');
  });

  it('caps the number of rows', () => {
    const full = Array.from({ length: 20 }, () => milestone());
    expect(addRow(full, emptyMilestone)).toHaveLength(20);
  });

  it('removes by key', () => {
    const [a, b] = [milestone(), milestone()];
    expect(removeRow([a, b], a.key)).toEqual([b]);
  });

  it('moves up and down, stopping at the ends', () => {
    const [a, b, c] = [milestone(), milestone(), milestone()];
    expect(moveRow([a, b, c], c.key, -1).map((r) => r.key)).toEqual([a.key, c.key, b.key]);
    expect(moveRow([a, b, c], a.key, 1).map((r) => r.key)).toEqual([b.key, a.key, c.key]);
    expect(moveRow([a, b, c], a.key, -1).map((r) => r.key)).toEqual([a.key, b.key, c.key]);
    expect(moveRow([a, b, c], c.key, 1).map((r) => r.key)).toEqual([a.key, b.key, c.key]);
  });

  it('updates one row immutably', () => {
    const [a, b] = [milestone(), milestone()];
    const next = updateRow([a, b], b.key, { title: 'Changed' });
    expect(next[1]?.title).toBe('Changed');
    expect(next[0]).toBe(a);
  });
});

describe('money maths', () => {
  it('parses rupees to paise', () => {
    expect(amountToPaise('1,250.5')).toBe(125050);
    expect(amountToPaise('')).toBeNull();
    expect(amountToPaise('abc')).toBeNull();
  });

  it('totals and shares', () => {
    const rows = [milestone({ amount: '3000' }), milestone({ amount: '1000' })];
    expect(totalPaise(rows)).toBe(400000);
    expect(sharePct(rows, 0)).toBe(75);
    expect(sharePct(rows, 1)).toBe(25);
    expect(sharePct([milestone({ amount: '' })], 0)).toBe(0);
  });

  it('round-trips paise to input text', () => {
    expect(paiseToInputText(125050)).toBe('1250.5');
    expect(paiseToInputText(500000)).toBe('5000');
    expect(paiseToInputText(1205)).toBe('12.05');
  });
});

describe('cap label', () => {
  it('follows the number of milestones', () => {
    expect(capLabel(2)).toBe('Max per milestone: 60% (2 milestones)');
    expect(capLabel(3)).toBe('Max per milestone: 40% (3 milestones)');
    expect(capLabel(5)).toBe('Max per milestone: 30% (5 milestones)');
    expect(capLabel(1)).toBe('Max per milestone: 100% (1 milestone)');
  });
});

describe('planIssues / describeIssue', () => {
  it('flags too few milestones', () => {
    const issues = planIssues([milestone()], TODAY);
    expect(issues.map((i) => i.kind)).toContain('too_few');
    expect(describeIssue({ kind: 'too_few', min: 2 })).toMatch(/at least 2/);
  });

  it('flags over-cap and date problems', () => {
    const rows = [
      milestone({ amount: '9000', due_date: '2026-12-10' }),
      milestone({ amount: '1000', due_date: '2026-12-01' }),
    ];
    const kinds = planIssues(rows, TODAY).map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['over_cap', 'date_order']));
    expect(
      planIssues([milestone({ due_date: '2026-10-01' }), milestone()], TODAY).map((i) => i.kind),
    ).toContain('date_past');
  });

  it('accepts a balanced plan', () => {
    expect(planIssues([milestone(), milestone()], TODAY)).toEqual([]);
  });
});

describe('validateBuilder', () => {
  it('is publishable for a complete valid project', () => {
    const v = validateBuilder(BASICS, [milestone(), milestone({ due_date: '2026-12-15' })], TODAY);
    expect(v.publishable).toBe(true);
    expect(v.savable).toBe(true);
  });

  it('reports field errors per milestone and blocks publish', () => {
    const bad = milestone({ title: '', amount: '' });
    const v = validateBuilder(BASICS, [bad, milestone()], TODAY);
    expect(v.milestones[bad.key]?.title).toBeTruthy();
    expect(v.milestones[bad.key]?.amount_paise).toBeTruthy();
    expect(v.publishable).toBe(false);
    expect(v.savable).toBe(false);
  });

  it('lets a draft save with cap problems, but not publish', () => {
    const rows = [milestone({ amount: '9000' }), milestone({ amount: '1000' }), milestone()];
    const v = validateBuilder(BASICS, rows, TODAY);
    expect(v.issues.length).toBeGreaterThan(0);
    expect(v.savable).toBe(true);
    expect(v.publishable).toBe(false);
  });

  it('requires a city for on-site work', () => {
    expect(basicsFieldErrors({ ...BASICS, is_remote: false }).city).toBeTruthy();
    expect(basicsFieldErrors({ ...BASICS, is_remote: false, city: 'Pune' }).city).toBeUndefined();
  });
});
