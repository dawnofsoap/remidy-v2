import { apiErrorResponse } from '@remidy/contracts';
import { user, verification } from '@remidy/db';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { ensureAdminAccount } from './admin.ts';
import { createAuth } from './index.ts';
import { signInOptionsFeature } from './sign-in-options.ts';
import { MAX_FAILED_SIGN_INS } from './throttle.ts';
import { freshAddress, ORIGIN, PERSON, PUBLIC_URL, useAuthHarness } from './testing.ts';

const h = useAuthHarness();
const { post, signIn, whoami, signedInCookie, createAccount } = h;
const NEW = 'a passphrase of my own';

const requestReset = (email: string) => post('/api/auth/request-password-reset', { email });
const reset = (token: string, newPassword = NEW) =>
  post('/api/auth/reset-password', { token, newPassword });

/** Mail is sent in the background, so wait for it to arrive. */
async function nextMail() {
  await expect.poll(() => h.mail.length).toBeGreaterThan(0);
  const mail = h.mail.shift();
  if (!mail) throw new Error('No mail arrived.');
  return mail;
}

function tokenIn(text: string): string {
  const token = /#token=(\S+)/.exec(text)?.[1];
  if (!token) throw new Error('The message has no reset link.');
  return token;
}

async function resetToken(): Promise<string> {
  expect((await requestReset(PERSON.email)).statusCode).toBe(200);
  return tokenIn((await nextMail()).text);
}

/** Long enough for anything sent in the background to have arrived. */
const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 150);
  });

describe('asking for a password reset', () => {
  it('sends a link to the app, to the account’s address', async () => {
    await createAccount();
    await requestReset(PERSON.email);
    const mail = await nextMail();
    expect(mail.to).toBe(PERSON.email);
    expect(mail.text).toContain(`${PUBLIC_URL}/reset-password#token=`);
  });

  it('keeps the token where it never reaches a server or its logs', async () => {
    await createAccount();
    await requestReset(PERSON.email);
    const { text } = await nextMail();
    expect(text).not.toMatch(/[?&]token=/);
  });

  it('ignores the case and spacing of the address', async () => {
    await createAccount();
    await requestReset('  ALEX@EXAMPLE.COM ');
    expect((await nextMail()).to).toBe(PERSON.email);
  });

  it('answers the same for an address with no account, and sends nothing', async () => {
    await createAccount();
    const known = await requestReset(PERSON.email);
    await nextMail();
    const unknown = await requestReset('nobody@example.com');
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.body).toBe(known.body);
    await settle();
    expect(h.mail).toHaveLength(0);
  });

  it('never mails the admin account, whose address can’t receive mail', async () => {
    await ensureAdminAccount(h.auth);
    const byName = await requestReset('admin');
    const byAddress = await requestReset('admin@remidy.invalid');
    expect(byName.statusCode).toBe(200);
    expect(byAddress.statusCode).toBe(200);
    await settle();
    expect(h.mail).toHaveLength(0);
  });

  it('doesn’t fail or reveal anything when the mail server is down', async () => {
    await createAccount();
    h.mailFailure = new Error('The mail server is down');
    const response = await requestReset(PERSON.email);
    h.mailFailure = null;
    expect(response.statusCode).toBe(200);
    await expect.poll(() => h.mailFailures).toHaveLength(1);
  });

  it('is limited per address, so it can’t be used to flood someone’s inbox', async () => {
    await createAccount();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await requestReset(PERSON.email)).statusCode);
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(10).every((status) => status === 429)).toBe(true);
    h.address = freshAddress();
    expect((await requestReset(PERSON.email)).statusCode).toBe(200);
  });
});

describe('resetting a password', () => {
  it('replaces the old password', async () => {
    await createAccount();
    const response = await reset(await resetToken());
    expect(response.statusCode).toBe(200);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(401);
    expect((await signIn(PERSON.email, NEW)).statusCode).toBe(200);
  });

  it('signs out every device', async () => {
    await createAccount();
    const cookie = await signedInCookie();
    await reset(await resetToken());
    expect((await whoami(cookie)).statusCode).toBe(401);
  });

  it('ends lockouts, because the person has proved who they are', async () => {
    await createAccount();
    for (let i = 0; i < MAX_FAILED_SIGN_INS; i += 1) {
      await signIn(PERSON.email, 'wrong password here');
    }
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(429);
    await reset(await resetToken());
    expect((await signIn(PERSON.email, NEW)).statusCode).toBe(200);
  });

  it('works only once', async () => {
    await createAccount();
    const token = await resetToken();
    expect((await reset(token)).statusCode).toBe(200);
    expect((await reset(token, 'another passphrase here')).statusCode).toBe(400);
    expect((await signIn(PERSON.email, NEW)).statusCode).toBe(200);
  });

  it('stops working once it expires', async () => {
    await createAccount();
    const token = await resetToken();
    await h.test.database.orm.update(verification).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await reset(token)).statusCode).toBe(400);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it('expires after an hour', async () => {
    await createAccount();
    await resetToken();
    const [row] = await h.test.database.orm.select().from(verification);
    const minutes = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(55);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it.each([
    ['made up', 'made-up-token'],
    ['empty', ''],
  ])('refuses a token that is %s', async (_name, token) => {
    await createAccount();
    expect((await reset(token)).statusCode).toBe(400);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it.each([
    ['too short', 'short1!'],
    ['only letters', 'onlylettershere'],
    ['a common word', 'my password is long'],
  ])('refuses a new password that is %s, and the link still works', async (_name, weak) => {
    await createAccount();
    const token = await resetToken();
    const response = await reset(token, weak);
    expect(response.statusCode).toBe(422);
    expect(apiErrorResponse.parse(response.json()).error.fields?.[0]?.path).toBe(
      'body.newPassword',
    );
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
    expect((await reset(token)).statusCode).toBe(200);
  });

  it('is limited per address, so tokens can’t be guessed', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await reset(`guess-${String(i)}`)).statusCode);
    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses.slice(10).every((status) => status === 429)).toBe(true);
  });

  it('clears a required password change, because the new one is the person’s own', async () => {
    await createAccount();
    await h.test.database.orm.update(user).set({ mustChangePassword: true });
    await reset(await resetToken());
    const response = await signIn(PERSON.email, NEW);
    const cookie = String(response.headers['set-cookie']).split(';', 1)[0];
    expect((await whoami(cookie)).statusCode).toBe(200);
  });
});

describe('without a way to send mail', () => {
  const noMail = () => {
    const orm = h.test.database.orm;
    const auth = createAuth({
      orm,
      secret: 'test-secret-that-is-long-enough-to-use',
      publicUrl: PUBLIC_URL,
    });
    return buildApp({
      database: h.test.database,
      features: [signInOptionsFeature({ orm, passwordReset: false })],
      auth: { auth, orm },
      publicUrl: PUBLIC_URL,
    });
  };

  it('has no reset routes, and tells the sign-in page', async () => {
    const app = noMail();
    for (const url of ['/api/auth/request-password-reset', '/api/auth/reset-password']) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: ORIGIN,
        payload: { email: PERSON.email, token: 'x', newPassword: NEW },
      });
      expect(response.statusCode).toBe(404);
    }
    const options = await app.inject({ url: '/api/sign-in-options' });
    expect(options.json()).toMatchObject({ passwordReset: false });
    await app.close();
  });

  it('is offered when mail can be sent', async () => {
    const options = await h.app.inject({ url: '/api/sign-in-options' });
    expect(options.json()).toMatchObject({ passwordReset: true });
  });
});
