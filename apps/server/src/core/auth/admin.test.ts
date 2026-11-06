import { ADMIN_EMAIL, apiErrorResponse, unmetPasswordRequirements } from '@remidy/contracts';
import { loginThrottle, user } from '@remidy/db';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  adminStartupMessage,
  ensureAdminAccount,
  generatePassword,
  resetAdminPassword,
} from './admin.ts';
import { cookieFrom, PERSON, useAuthHarness } from './testing.ts';
import { MAX_FAILED_SIGN_INS } from './throttle.ts';

const h = useAuthHarness();
const { post, signIn, whoami, signedInCookie, createAccount } = h;

describe('the admin account', () => {
  const NEW = 'a passphrase of my own';
  const options = async () => (await h.app.inject({ url: '/api/sign-in-options' })).json<unknown>();
  const choosePassword = (cookie: string, currentPassword: string, newPassword = NEW) =>
    post('/api/auth/change-password', { currentPassword, newPassword }, { cookie });

  /** Signs in as admin with a generated password, and returns the session cookie. */
  async function asAdmin(password: string): Promise<string> {
    const response = await signIn(ADMIN_EMAIL, password);
    expect(response.statusCode).toBe(200);
    return cookieFrom(response);
  }

  it('is created once, however many copies of the app start together', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureAdminAccount(h.auth)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await ensureAdminAccount(h.auth)).toBeNull();
    expect(await h.test.database.orm.select().from(user)).toHaveLength(1);
  });

  it('has a generated password that meets the requirements and is unique', () => {
    const passwords = Array.from({ length: 200 }, generatePassword);
    expect(new Set(passwords).size).toBe(200);
    for (const password of passwords) {
      expect(unmetPasswordRequirements(password)).toEqual([]);
      expect(password).toHaveLength(29);
    }
  });

  it('stores the password only as a hash', async () => {
    const password = await ensureAdminAccount(h.auth);
    const result = await h.test.database.orm.execute(sql`select password from account`);
    const stored = String(result.rows[0]?.password);
    expect(stored).not.toContain(String(password));
    expect(stored.length).toBeGreaterThan(40);
  });

  it('signs in with its email, ignoring case and spaces, and is the instance admin', async () => {
    const password = String(await ensureAdminAccount(h.auth));
    expect((await signIn(` ${ADMIN_EMAIL.toUpperCase()} `, password)).statusCode).toBe(200);
    const cookie = await asAdmin(password);
    expect((await choosePassword(cookie, password)).statusCode).toBe(200);
    const me = await whoami(await asAdmin(NEW));
    expect(me.json()).toMatchObject({ email: ADMIN_EMAIL, isInstanceAdmin: true });
  });

  it('can do nothing else until the generated password is replaced', async () => {
    const password = String(await ensureAdminAccount(h.auth));
    const cookie = await asAdmin(password);

    const refused = await whoami(cookie);
    expect(refused.statusCode).toBe(403);
    expect(apiErrorResponse.parse(refused.json()).error.code).toBe('password_change_required');
    const current = await h.app.inject({ url: '/api/auth/get-session', headers: { cookie } });
    expect(current.json()).toMatchObject({ user: { mustChangePassword: true } });

    expect((await choosePassword(cookie, password)).statusCode).toBe(200);
    expect((await signIn(ADMIN_EMAIL, password)).statusCode).toBe(401);
    expect((await whoami(await asAdmin(NEW))).statusCode).toBe(200);
  });

  it('stays blocked if the change fails', async () => {
    const password = String(await ensureAdminAccount(h.auth));
    const cookie = await asAdmin(password);
    expect((await choosePassword(cookie, 'not the password')).statusCode).toBe(400);
    expect((await whoami(cookie)).statusCode).toBe(403);
  });

  it('cannot keep the generated password', async () => {
    const password = String(await ensureAdminAccount(h.auth));
    const response = await choosePassword(await asAdmin(password), password, password);
    expect(response.statusCode).toBe(422);
    expect(apiErrorResponse.parse(response.json()).error.fields?.[0]?.path).toBe(
      'body.newPassword',
    );
  });

  it('tells the sign-in page only while the generated password is in use', async () => {
    expect(await options()).toMatchObject({ adminPasswordInConsole: false });
    const password = String(await ensureAdminAccount(h.auth));
    expect(await options()).toMatchObject({ adminPasswordInConsole: true });
    await choosePassword(await asAdmin(password), password);
    expect(await options()).toMatchObject({ adminPasswordInConsole: false });
    await resetAdminPassword(h.auth, h.test.database.orm);
    expect(await options()).toMatchObject({ adminPasswordInConsole: true });
  });

  it('has no special username', async () => {
    const password = String(await ensureAdminAccount(h.auth));
    expect((await signIn('admin', password)).statusCode).not.toBe(200);
    expect(await h.test.database.orm.select().from(loginThrottle)).toHaveLength(0);
  });

  describe('what each server start prints', () => {
    const start = () => adminStartupMessage(h.auth, h.test.database.orm);
    const printedPassword = (message: string | null) =>
      /Password: (\S+)/.exec(String(message))?.[1] ?? '';

    it('shows the password when the account is created', async () => {
      const message = await start();
      expect(message).toContain(ADMIN_EMAIL);
      expect((await signIn(ADMIN_EMAIL, printedPassword(message))).statusCode).toBe(200);
    });

    it('says how to get a new one on later starts, since the old logs may be gone', async () => {
      await start();
      const message = await start();
      expect(message).toContain('reset-admin-password');
      expect(message).toContain(ADMIN_EMAIL);
      expect(printedPassword(message)).toBe('');
    });

    it('does the same after the password was replaced from the server', async () => {
      await resetAdminPassword(h.auth, h.test.database.orm);
      expect(await start()).toContain('reset-admin-password');
    });

    it('prints nothing once the admin has chosen a password', async () => {
      const first = printedPassword(await start());
      await choosePassword(await asAdmin(first), first);
      expect(await start()).toBeNull();
    });

    it('never prints the password twice', async () => {
      const first = printedPassword(await start());
      expect(await start()).not.toContain(first);
    });
  });

  describe('when the password is lost', () => {
    it('gets a new generated one, and the old one stops working', async () => {
      const lost = String(await ensureAdminAccount(h.auth));
      const fresh = await resetAdminPassword(h.auth, h.test.database.orm);
      expect(fresh).not.toBe(lost);
      expect((await signIn(ADMIN_EMAIL, lost)).statusCode).toBe(401);
      expect((await signIn(ADMIN_EMAIL, fresh)).statusCode).toBe(200);
    });

    it('works after the admin has chosen a password, and asks for a new one again', async () => {
      const first = String(await ensureAdminAccount(h.auth));
      await choosePassword(await asAdmin(first), first);
      const fresh = await resetAdminPassword(h.auth, h.test.database.orm);
      expect((await signIn(ADMIN_EMAIL, NEW)).statusCode).toBe(401);
      expect((await whoami(await asAdmin(fresh))).statusCode).toBe(403);
    });

    it('signs the admin out everywhere', async () => {
      const first = String(await ensureAdminAccount(h.auth));
      await choosePassword(await asAdmin(first), first);
      const cookie = await asAdmin(NEW);
      expect((await whoami(cookie)).statusCode).toBe(200);
      await resetAdminPassword(h.auth, h.test.database.orm);
      expect((await whoami(cookie)).statusCode).toBe(401);
    });

    it('ends lockouts from every address', async () => {
      const first = String(await ensureAdminAccount(h.auth));
      for (let i = 0; i < MAX_FAILED_SIGN_INS; i += 1)
        await signIn(ADMIN_EMAIL, 'wrong password here');
      expect((await signIn(ADMIN_EMAIL, first)).statusCode).toBe(429);
      const fresh = await resetAdminPassword(h.auth, h.test.database.orm);
      expect((await signIn(ADMIN_EMAIL, fresh)).statusCode).toBe(200);
    });

    it('creates the account if it was never finished', async () => {
      const fresh = await resetAdminPassword(h.auth, h.test.database.orm);
      expect((await signIn(ADMIN_EMAIL, fresh)).statusCode).toBe(200);

      // The sign-in row exists without its password, as after a crash partway through creation.
      await h.test.database.orm.execute(sql`delete from account`);
      const again = await resetAdminPassword(h.auth, h.test.database.orm);
      expect((await signIn(ADMIN_EMAIL, again)).statusCode).toBe(200);
      expect(await h.test.database.orm.select().from(user)).toHaveLength(1);
    });

    it('leaves other accounts alone', async () => {
      await createAccount();
      await ensureAdminAccount(h.auth);
      const cookie = await signedInCookie();
      await resetAdminPassword(h.auth, h.test.database.orm);
      expect((await whoami(cookie)).statusCode).toBe(200);
      expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
    });
  });
});
