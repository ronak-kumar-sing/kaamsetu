import { resolveMode } from '../mode';

describe('resolveMode', () => {
  it('keeps the saved mode when the user still has that role', () => {
    expect(resolveMode(['client', 'freelancer'], 'freelancer')).toBe('freelancer');
  });

  it('falls back when the saved role was removed', () => {
    expect(resolveMode(['freelancer'], 'client')).toBe('freelancer');
  });

  it('prefers client, then freelancer, then admin', () => {
    expect(resolveMode(['admin', 'freelancer', 'client'], null)).toBe('client');
    expect(resolveMode(['admin'], null)).toBe('admin');
  });

  it('returns null without roles', () => {
    expect(resolveMode([], 'client')).toBeNull();
  });
});
