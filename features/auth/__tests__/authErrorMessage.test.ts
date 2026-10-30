jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/queryClient', () => ({}));

import { authErrorMessage } from '../api';

describe('authErrorMessage', () => {
  it('does not blame the code when sending fails', () => {
    const error = new Error('Error sending confirmation OTP to provider: invalid username');
    expect(authErrorMessage(error, 'send')).toMatch(/couldn't send a text/);
  });

  it('reports a bad code when verifying', () => {
    expect(authErrorMessage(new Error('Token has expired or is invalid'), 'verify')).toMatch(
      /invalid or has expired/,
    );
  });

  it('handles rate limits in both stages', () => {
    const error = new Error('For security purposes, you can only request this after 30 seconds');
    expect(authErrorMessage(error, 'send')).toMatch(/Too many attempts/);
    expect(authErrorMessage(error, 'verify')).toMatch(/Too many attempts/);
  });
});
