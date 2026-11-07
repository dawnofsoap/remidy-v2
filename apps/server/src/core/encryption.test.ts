import fc from 'fast-check';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEncryptor, DecryptionError } from './encryption.ts';

const newKey = () => randomBytes(32).toString('base64');
const CONTEXT = 'mfa:user-1';

describe('encrypting a stored secret', () => {
  const encryptor = createEncryptor(newKey());

  it('reads back whatever was stored', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (secret, context) => {
        expect(encryptor.decrypt(encryptor.encrypt(secret, context), context)).toBe(secret);
      }),
    );
  });

  it.each([
    ['an empty value', ''],
    ['other languages and symbols', 'contraseña 🔐 秘密'],
    ['something long', 'x'.repeat(100_000)],
  ])('handles %s', (_name, secret) => {
    expect(encryptor.decrypt(encryptor.encrypt(secret, CONTEXT), CONTEXT)).toBe(secret);
  });

  it('never stores anything readable', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const stored = encryptor.encrypt(secret, CONTEXT);
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(Buffer.from(secret).toString('base64'));
    expect(stored).not.toContain(CONTEXT);
  });

  it('looks different every time, even for the same secret', () => {
    const stored = new Set(Array.from({ length: 100 }, () => encryptor.encrypt('same', CONTEXT)));
    expect(stored.size).toBe(100);
  });
});

describe('refusing to decrypt', () => {
  const key = newKey();
  const encryptor = createEncryptor(key);
  const stored = encryptor.encrypt('a secret', CONTEXT);
  const parts = stored.split('.');
  const withPart = (index: number, value: string) =>
    parts.map((part, i) => (i === index ? value : part)).join('.');
  const flipFirstCharacter = (value = '') =>
    `${value.startsWith('A') ? 'B' : 'A'}${value.slice(1)}`;

  it('refuses a value copied from another record', () => {
    expect(() => encryptor.decrypt(stored, 'mfa:user-2')).toThrow(DecryptionError);
  });

  it('refuses without the key it was encrypted with', () => {
    expect(() => createEncryptor(newKey()).decrypt(stored, CONTEXT)).toThrow(DecryptionError);
  });

  it.each([
    ['the value', 3],
    ['the check that detects tampering', 4],
    ['the random value', 2],
  ])('refuses when %s was changed', (_name, index) => {
    const tampered = withPart(index, flipFirstCharacter(parts[index]));
    expect(() => encryptor.decrypt(tampered, CONTEXT)).toThrow(DecryptionError);
  });

  it('refuses a shortened check, which would make forgery easier', () => {
    const shortened = withPart(
      4,
      Buffer.from(parts[4] ?? '', 'base64url')
        .subarray(0, 4)
        .toString('base64url'),
    );
    expect(() => encryptor.decrypt(shortened, CONTEXT)).toThrow(DecryptionError);
  });

  it.each([
    ['nothing', ''],
    ['plain text', 'not encrypted'],
    ['too few parts', 'v1.abc'],
    ['too many parts', `${stored}.extra`],
    ['a format it does not know', withPart(0, 'v9')],
    ['a key it does not know', withPart(1, 'deadbeef')],
    ['a key name from the object prototype', withPart(1, '__proto__')],
  ])('refuses %s', (_name, value) => {
    expect(() => encryptor.decrypt(value, CONTEXT)).toThrow(DecryptionError);
  });

  it('never repeats the value or the key in its error', () => {
    try {
      encryptor.decrypt(stored, 'mfa:user-2');
      expect.unreachable();
    } catch (error) {
      const text = `${String(error)} ${JSON.stringify(error)} ${(error as Error).stack ?? ''}`;
      expect(text).not.toContain(key);
      expect(text).not.toContain(parts[3]);
      expect(text).not.toContain('mfa:user-2');
    }
  });
});

describe('rotating keys', () => {
  it('reads values from the old key, and writes new ones with the current key', () => {
    const oldKey = newKey();
    const before = createEncryptor(oldKey);
    const stored = before.encrypt('a secret', CONTEXT);

    const after = createEncryptor(newKey(), [oldKey]);
    expect(after.decrypt(stored, CONTEXT)).toBe('a secret');

    const rewritten = after.encrypt('a secret', CONTEXT);
    expect(after.decrypt(rewritten, CONTEXT)).toBe('a secret');
    expect(() => before.decrypt(rewritten, CONTEXT)).toThrow(DecryptionError);
  });

  it('stops reading a value once its key is removed', () => {
    const oldKey = newKey();
    const stored = createEncryptor(oldKey).encrypt('a secret', CONTEXT);
    expect(() => createEncryptor(newKey()).decrypt(stored, CONTEXT)).toThrow(DecryptionError);
  });
});

describe('keys', () => {
  it.each([
    ['too short', randomBytes(16).toString('base64')],
    ['too long', randomBytes(33).toString('base64')],
    ['empty', ''],
  ])('refuses a current key that is %s', (_name, key) => {
    expect(() => createEncryptor(key)).toThrow(/32 bytes/);
  });

  it('refuses a bad old key', () => {
    expect(() => createEncryptor(newKey(), ['short'])).toThrow(/32 bytes/);
  });
});
