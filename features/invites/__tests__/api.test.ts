jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/queryClient', () => ({}));

import { PROJECT_INVITE_COLUMNS } from '../api';

describe('PROJECT_INVITE_COLUMNS', () => {
  const columns = PROJECT_INVITE_COLUMNS.split(',').map((c) => c.trim());

  it('never selects the secret token or a wildcard', () => {
    expect(columns).not.toContain('token');
    expect(columns).not.toContain('*');
  });

  it('includes the columns the UI reads', () => {
    expect(columns).toEqual(
      expect.arrayContaining(['id', 'project_id', 'status', 'expires_at', 'freelancer_id']),
    );
  });
});
