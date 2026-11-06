import { ADMIN_EMAIL, signInOptionsResponse } from '@remidy/contracts';
import { user, type Orm } from '@remidy/db';
import { eq } from 'drizzle-orm';
import { defineFeature, defineRoute, type Feature } from '../feature.ts';

/** What the sign-in page needs to know before anyone has signed in. */
export function signInOptionsFeature({
  orm,
  passwordReset,
}: {
  orm: Orm;
  passwordReset: boolean;
}): Feature {
  return defineFeature({
    name: 'sign-in-options',
    routes: () => [
      defineRoute({
        method: 'GET',
        url: '/api/sign-in-options',
        access: 'public',
        response: signInOptionsResponse,
        handler: async () => {
          const [admin] = await orm
            .select({ mustChangePassword: user.mustChangePassword })
            .from(user)
            .where(eq(user.email, ADMIN_EMAIL));
          return { adminPasswordInConsole: admin?.mustChangePassword === true, passwordReset };
        },
      }),
    ],
  });
}
