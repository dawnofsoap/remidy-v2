import { ADMIN_EMAIL, unmetPasswordRequirements } from '@remidy/contracts';
import { session, user, type Orm } from '@remidy/db';
import { eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import type { Auth } from './index.ts';
import { clearAllFailedSignIns } from './throttle.ts';

// No letters or digits that look alike, because a person may have to retype this from a console.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GROUPS = 6;
const GROUP_LENGTH = 4;

/** About 119 bits of randomness, in the form tulw-8mzq-…, and always meets the requirements. */
export function generatePassword(): string {
  for (;;) {
    const password = Array.from({ length: GROUPS }, () =>
      Array.from({ length: GROUP_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
    ).join('-');
    if (unmetPasswordRequirements(password).length === 0) return password;
  }
}

/** For the console only. This must never go through the logger, which may be sent elsewhere. */
export function adminPasswordNotice(password: string): string {
  return `
================================================================
  Remidy admin account

  Username: admin
  Password: ${password}

  You'll choose a new password the first time you sign in.
================================================================
`;
}

async function findAdmin(auth: Auth) {
  const context = await auth.$context;
  return context.internalAdapter.findUserByEmail(ADMIN_EMAIL, { includeAccounts: true });
}

/** Creates the admin account if there isn't one. Returns its password only if it was created. */
export async function ensureAdminAccount(auth: Auth): Promise<string | null> {
  if (await findAdmin(auth)) return null;

  const context = await auth.$context;
  let id: string;
  try {
    const created = await context.internalAdapter.createUser(
      { name: 'Admin', email: ADMIN_EMAIL, isInstanceAdmin: true, mustChangePassword: true },
      { method: 'email' },
    );
    id = created.id;
  } catch (error) {
    // Another copy of the app starting at the same moment got there first, and printed its own.
    if (await findAdmin(auth)) return null;
    throw error;
  }

  const password = generatePassword();
  await context.internalAdapter.linkAccount({
    userId: id,
    providerId: 'credential',
    accountId: id,
    password: await context.password.hash(password),
  });
  return password;
}

/**
 * Replaces the admin's password with a new generated one, for when it's lost. This needs access to
 * the server, not the old password, so it always works. Also ends every admin session and lockout.
 */
export async function resetAdminPassword(auth: Auth, orm: Orm): Promise<string> {
  const created = await ensureAdminAccount(auth);
  if (created) return created;

  const admin = await findAdmin(auth);
  if (!admin) throw new Error('The admin account could not be found or created.');
  const { id } = admin.user;

  const context = await auth.$context;
  const password = generatePassword();
  const hash = await context.password.hash(password);
  if (admin.accounts.some((account) => account.providerId === 'credential')) {
    await context.internalAdapter.updatePassword(id, hash);
  } else {
    await context.internalAdapter.linkAccount({
      userId: id,
      providerId: 'credential',
      accountId: id,
      password: hash,
    });
  }
  await orm.update(user).set({ mustChangePassword: true }).where(eq(user.id, id));
  await orm.delete(session).where(eq(session.userId, id));
  await clearAllFailedSignIns(orm, ADMIN_EMAIL);
  return password;
}
