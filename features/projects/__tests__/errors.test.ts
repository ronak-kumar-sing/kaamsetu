import { rpcErrorKey, rpcErrorMessage } from '../errors';

const KEYS = [
  'project_not_found',
  'not_project_client',
  'not_assigned_freelancer',
  'invalid_status',
  'milestone_cap_exceeded',
  'too_few_milestones',
  'milestone_dates_invalid',
  'revision_limit_reached',
  'already_proposed',
  'cannot_propose_own_project',
  'invite_invalid',
  'role_required',
  'invalid_input',
  'plan_total_mismatch',
  'price_change_needs_plan',
  'milestone_not_found',
  'proposal_not_found',
  'not_authenticated',
  'milestone_status_locked',
];

describe('rpcErrorMessage', () => {
  it.each(KEYS)('maps %s to friendly copy', (key) => {
    const text = rpcErrorMessage({ code: 'P0001', message: key });
    expect(text).not.toContain('_');
    expect(text).not.toBe(rpcErrorMessage(new Error('x')));
  });

  it('finds a key inside a longer message', () => {
    expect(rpcErrorKey({ message: 'error: milestone_cap_exceeded (ctx)' })).toBe(
      'milestone_cap_exceeded',
    );
  });

  it('maps permission errors', () => {
    expect(rpcErrorMessage({ code: '42501', message: 'permission denied for table x' })).toMatch(
      /permission/,
    );
  });

  it('maps network failures', () => {
    expect(rpcErrorMessage(new TypeError('Network request failed'))).toMatch(/internet/);
    expect(rpcErrorMessage({ message: 'Failed to fetch' })).toMatch(/internet/);
  });

  it('falls back for unknown errors and nullish input', () => {
    expect(rpcErrorMessage({ message: 'boom' })).toMatch(/Something went wrong/);
    expect(rpcErrorMessage(null)).toMatch(/Something went wrong/);
    expect(rpcErrorKey({ message: 'boom' })).toBeNull();
  });
});
