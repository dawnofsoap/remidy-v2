import { z } from 'zod';

export * from './password.ts';

export const healthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponse>;

export const signInOptionsResponse = z.object({
  /** True while the admin's generated password, printed in the server console, is still in use. */
  adminPasswordInConsole: z.boolean(),
  /** False when the server has no way to send mail, so the page shouldn't offer it. */
  passwordReset: z.boolean(),
});

const timeZone = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { error: 'Choose a valid time zone.' },
);

export const spaceRole = z.enum(['member', 'manager', 'owner']);
export type SpaceRole = z.infer<typeof spaceRole>;

export const spaceResponse = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['personal', 'shared']),
  timeZone: z.string(),
  role: spaceRole,
});
export type SpaceResponse = z.infer<typeof spaceResponse>;

export const updateSpaceRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name.')
    .max(100, 'Use 100 characters or fewer.')
    .optional(),
  timeZone: timeZone.optional(),
});

export const spaceMemberResponse = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: spaceRole,
});

/** The signed-in person, or null when nobody is. */
export const sessionResponse = z
  .object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      /** Set while the password is a generated one, which must be replaced before anything else. */
      mustChangePassword: z.boolean(),
      /** Manages the instance. Gives no access to anyone's bills. */
      isInstanceAdmin: z.boolean(),
    }),
  })
  .nullable();

export const jobStatusResponse = z.array(
  z.object({
    name: z.string(),
    description: z.string(),
    /** `waiting` hasn't run yet, and `late` has missed its schedule. */
    state: z.enum(['ok', 'waiting', 'late', 'failing']),
    lastSucceededAt: z.iso.datetime().nullable(),
    lastFailedAt: z.iso.datetime().nullable(),
  }),
);
export type JobStatusResponse = z.infer<typeof jobStatusResponse>;

export const enabledFeaturesResponse = z.object({
  /** Flagged features that are switched on. */
  enabled: z.array(z.string()),
});

/** The shape of every error the API returns. */
export const apiErrorResponse = z.object({
  error: z.object({
    /** Stable and safe to check in code, for example `not_found`. */
    code: z.string(),
    /** Safe to show to a person. */
    message: z.string(),
    /** Quote this when reporting a problem. It matches the server logs. */
    requestId: z.string(),
    /** Problems with individual fields, when there are any. */
    fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponse>;
