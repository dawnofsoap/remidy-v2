import { signInOptionsResponse } from '@remidy/contracts';
import type { Orm } from '@remidy/db';
import { defineFeature, defineRoute, type Feature } from '../feature.ts';
import { isAdminPasswordPending } from './admin.ts';

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
        url: '/api/v1/sign-in-options',
        access: 'public',
        response: signInOptionsResponse,
        handler: async () => ({
          adminPasswordInConsole: await isAdminPasswordPending(orm),
          passwordReset,
        }),
      }),
    ],
  });
}
