jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

import { isPermanentError } from '../queryClient';

describe('isPermanentError', () => {
  it.each([
    [{ status: 401 }, true],
    [{ status: 422 }, true],
    [{ code: '42501', message: 'permission denied' }, true],
    [{ code: 'P0001', message: 'Not allowed' }, true],
    [{ code: 'PGRST116' }, true],
    [{ code: '23505' }, true],
    [{ status: 503 }, false],
    [new TypeError('Network request failed'), false],
    [null, false],
  ])('%p → %p', (error, expected) => {
    expect(isPermanentError(error)).toBe(expected);
  });
});
