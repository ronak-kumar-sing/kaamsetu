const mockSecure = new Map<string, string>();
const mockLocal = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));

let mockCounter = 0;
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) =>
    Uint8Array.from({ length: n }, (_, i) => (i * 7 + ++mockCounter) % 256),
}));

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => mockLocal.get(k) ?? null,
    setItem: (k: string, v: string) => void mockLocal.set(k, v),
    removeItem: (k: string) => void mockLocal.delete(k),
  },
});

import { secureSessionStorage } from '../secureSessionStorage';

const SESSION = JSON.stringify({ access_token: 'a'.repeat(3000), refresh_token: 'r-123' });

beforeEach(() => {
  mockSecure.clear();
  mockLocal.clear();
});

it('round-trips a session larger than SecureStore allows', async () => {
  await secureSessionStorage.setItem('sb-auth', SESSION);
  expect(await secureSessionStorage.getItem('sb-auth')).toBe(SESSION);
});

it('never stores plaintext in localStorage', async () => {
  await secureSessionStorage.setItem('sb-auth', SESSION);
  expect(mockLocal.get('sb-auth')).not.toContain('r-123');
  expect(mockSecure.get('sb-auth.k')).toHaveLength(64);
});

it('returns null and cleans up when the key is gone (e.g. reinstall)', async () => {
  await secureSessionStorage.setItem('sb-auth', SESSION);
  mockSecure.clear();
  expect(await secureSessionStorage.getItem('sb-auth')).toBeNull();
});

it('removes both halves', async () => {
  await secureSessionStorage.setItem('sb-auth', SESSION);
  await secureSessionStorage.removeItem('sb-auth');
  expect(mockLocal.size + mockSecure.size).toBe(0);
});
