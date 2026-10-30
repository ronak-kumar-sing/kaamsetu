import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Supabase auth storage that keeps the session encrypted at rest.
 *
 * SecureStore (Keychain/Keystore) has a ~2KB value limit, which a Supabase session exceeds, so
 * each value is AES-256-CTR encrypted with a fresh random key: the key lives in SecureStore and
 * the ciphertext in expo-sqlite's localStorage. A new key is generated on every write, so the
 * fixed CTR counter never reuses a key/nonce pair.
 */
const keyName = (key: string) => `${key}.k`;

async function encrypt(key: string, value: string): Promise<string> {
  const encryptionKey = Crypto.getRandomBytes(32);
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(keyName(key), aesjs.utils.hex.fromBytes(encryptionKey), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return aesjs.utils.hex.fromBytes(encrypted);
}

async function decrypt(key: string, value: string): Promise<string | null> {
  const encryptionKeyHex = await SecureStore.getItemAsync(keyName(key));
  if (!encryptionKeyHex) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(encryptionKeyHex),
    new aesjs.Counter(1),
  );
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await decrypt(key, encrypted);
    } catch {
      // Corrupt or orphaned ciphertext (e.g. Keychain wiped on reinstall): treat as signed out.
      localStorage.removeItem(key);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, await encrypt(key, value));
  },
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keyName(key));
  },
};
