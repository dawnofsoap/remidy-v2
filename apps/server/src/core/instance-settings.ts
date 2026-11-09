import { instanceSetting, type Orm } from '@remidy/db';
import { eq, sql } from 'drizzle-orm';
import type { Encryptor } from './encryption.ts';

/**
 * Settings for the whole instance that hold a secret, such as a service's key. They're stored
 * encrypted, and only ever read back on the server: the browser only learns whether one is set.
 */

const contextOf = (key: string) => `instance-setting:${key}`;

export interface SecretSettingInfo {
  configured: boolean;
  updatedAt: string | null;
}

export async function secretSettingInfo(orm: Orm, key: string): Promise<SecretSettingInfo> {
  const [row] = await orm
    .select({ updatedAt: instanceSetting.updatedAt })
    .from(instanceSetting)
    .where(eq(instanceSetting.key, key));
  return { configured: row !== undefined, updatedAt: row?.updatedAt.toISOString() ?? null };
}

/** The secret, or null when none is set. */
export async function readSecretSetting(
  orm: Orm,
  encryptor: Encryptor,
  key: string,
): Promise<string | null> {
  const [row] = await orm
    .select({ value: instanceSetting.value })
    .from(instanceSetting)
    .where(eq(instanceSetting.key, key));
  return row ? encryptor.decrypt(row.value, contextOf(key)) : null;
}

export async function writeSecretSetting(
  orm: Orm,
  encryptor: Encryptor,
  key: string,
  secret: string,
  userId: string,
): Promise<void> {
  const value = encryptor.encrypt(secret, contextOf(key));
  await orm
    .insert(instanceSetting)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({
      target: instanceSetting.key,
      set: { value, updatedBy: userId, updatedAt: sql`now()` },
    });
}

export async function removeSetting(orm: Orm, key: string): Promise<void> {
  await orm.delete(instanceSetting).where(eq(instanceSetting.key, key));
}
