import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const FORMAT = 'v1';

/** Says nothing about why, because the reason could help someone tampering with stored data. */
export class DecryptionError extends Error {
  override name = 'DecryptionError';

  constructor() {
    super('The stored value could not be decrypted.');
  }
}

export interface Encryptor {
  /**
   * Encrypts a secret to store, such as an MFA key. `context` says what it belongs to, such as
   * `mfa:<user id>`, and the same context is needed to decrypt it, so a stored value can't be
   * copied onto another record and still work.
   */
  encrypt(plaintext: string, context: string): string;
  decrypt(stored: string, context: string): string;
}

function decodeKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`An encryption key must be ${String(KEY_BYTES)} bytes, encoded as base64.`);
  }
  return key;
}

/** Stored beside each value, so the right key is found after a rotation. Reveals nothing. */
const keyId = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 8);

const encode = (value: Buffer) => value.toString('base64url');

/**
 * Encrypts with the current key, and decrypts with it or any old key. To rotate, make the current
 * key an old one, set a new one, and re-encrypt what's stored before removing the old key.
 */
export function createEncryptor(currentKey: string, oldKeys: readonly string[] = []): Encryptor {
  const current = decodeKey(currentKey);
  const keys = new Map(
    [currentKey, ...oldKeys].map((encoded) => {
      const key = decodeKey(encoded);
      return [keyId(key), key] as const;
    }),
  );

  return {
    encrypt(plaintext, context) {
      // A new random value every time, so the same secret never looks the same twice.
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, current, iv);
      cipher.setAAD(Buffer.from(context));
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        FORMAT,
        keyId(current),
        encode(iv),
        encode(encrypted),
        encode(cipher.getAuthTag()),
      ].join('.');
    },

    decrypt(stored, context) {
      const [format, id, iv, encrypted, tag, ...rest] = stored.split('.');
      const key = id === undefined ? undefined : keys.get(id);
      if (
        format !== FORMAT ||
        !key ||
        iv === undefined ||
        encrypted === undefined ||
        tag === undefined ||
        rest.length > 0
      ) {
        throw new DecryptionError();
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'), {
          authTagLength: 16,
        });
        decipher.setAAD(Buffer.from(context));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(encrypted, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new DecryptionError();
      }
    },
  };
}

/** For an app with no key, such as in tests that store no secrets. Storing one fails loudly. */
export const unavailableEncryptor: Encryptor = {
  encrypt() {
    throw new Error('No encryption key was given, so secrets can’t be stored.');
  },
  decrypt() {
    throw new Error('No encryption key was given, so secrets can’t be read.');
  },
};
