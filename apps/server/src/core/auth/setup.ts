import { createSetupRequest, setupStatusResponse } from '@remidy/contracts';
import { setupClaim, user, type Orm } from '@remidy/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { defineFeature, defineRoute, type Feature } from '../feature.ts';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type Auth } from './index.ts';
import { setUserSpacesTimeZone } from '../spaces.ts';
import { normalizeEmail } from './throttle.ts';

const CLAIM_ID = 1;

/** Only one caller can ever insert this row, however many try at once. */
async function claimSetup(orm: Orm): Promise<boolean> {
  const claimed = await orm
    .insert(setupClaim)
    .values({ id: CLAIM_ID })
    .onConflictDoNothing()
    .returning({ id: setupClaim.id });
  return claimed.length > 0;
}

async function isSetupDone(orm: Orm): Promise<boolean> {
  const rows = await orm.select({ id: setupClaim.id }).from(setupClaim);
  return rows.length > 0;
}

/** First-run setup: creates the first account, then closes for good. */
export function setupFeature({ auth, orm }: { auth: Auth; orm: Orm }): Feature {
  return defineFeature({
    name: 'setup',
    routes: () => [
      defineRoute({
        method: 'GET',
        url: '/api/setup',
        access: 'public',
        response: setupStatusResponse,
        handler: async () => ({ needed: !(await isSetupDone(orm)) }),
      }),
      defineRoute({
        method: 'POST',
        url: '/api/setup',
        access: 'public',
        status: 204,
        body: createSetupRequest(MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH),
        response: z.undefined(),
        handler: async ({ body }) => {
          if (!(await claimSetup(orm))) {
            throw new AppError(409, 'setup_complete', 'Setup has already been completed.');
          }
          try {
            const context = await auth.$context;
            const created = await context.internalAdapter.createUser(
              { name: body.name, email: normalizeEmail(body.email), isInstanceAdmin: true },
              { method: 'email' },
            );
            await context.internalAdapter.linkAccount({
              userId: created.id,
              providerId: 'credential',
              accountId: created.id,
              password: await context.password.hash(body.password),
            });
            if (body.timeZone) await setUserSpacesTimeZone(orm, created.id, body.timeZone);
          } catch (error) {
            // Let setup be tried again rather than leaving the instance with no way in.
            await orm.delete(user).where(eq(user.email, normalizeEmail(body.email)));
            await orm.delete(setupClaim).where(eq(setupClaim.id, CLAIM_ID));
            throw error;
          }
        },
      }),
    ],
  });
}
