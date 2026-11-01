import type { ProposalMilestoneEdit } from '../api';
import { diffPlans, planTotal, priceChanged } from '../diff';

const a = { id: 'a', title: 'A', amount_paise: 100000, due_date: '2026-12-01' };
const b = { id: 'b', title: 'B', amount_paise: 200000, due_date: '2026-12-10' };

function edit(
  over: Partial<ProposalMilestoneEdit> & Pick<ProposalMilestoneEdit, 'title'>,
): ProposalMilestoneEdit {
  return {
    source_milestone_id: null,
    amount_paise: 100000,
    due_date: '2026-12-01',
    deliverable: null,
    acceptance_criteria: null,
    ...over,
  };
}
const sameA = edit({ source_milestone_id: 'a', title: 'A' });
const sameB = edit({
  source_milestone_id: 'b',
  title: 'B',
  amount_paise: 200000,
  due_date: '2026-12-10',
});

describe('diffPlans', () => {
  it('marks identical, changed and added rows', () => {
    const rows = diffPlans(
      [a, b],
      [sameA, { ...sameB, amount_paise: 250000 }, edit({ title: 'C', deliverable: 'x' })],
    );
    expect(rows.map((r) => r.change)).toEqual(['same', 'changed', 'added']);
  });
  it('matches by source id, not position, and lists dropped milestones last', () => {
    const rows = diffPlans([a, b], [sameB]);
    expect(rows.map((r) => r.change)).toEqual(['same', 'removed']);
    expect(rows[1]?.current?.id).toBe('a');
  });
  it('treats an unknown source id as added', () => {
    const rows = diffPlans([a], [edit({ source_milestone_id: 'zzz', title: 'A' })]);
    expect(rows.map((r) => r.change)).toEqual(['added', 'removed']);
  });
  it('sums totals and detects price changes', () => {
    expect(planTotal([a, b])).toBe(300000);
    expect(priceChanged(300000, 300000)).toBe(false);
    expect(priceChanged(250000, 300000)).toBe(true);
  });
});
