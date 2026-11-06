import { z } from 'zod';

// Passwords that are public or guessable. The first is the development password in compose.yaml.
const UNSAFE_PASSWORDS = new Set([
  'remidy_dev_only',
  'replace-me',
  'changeme',
  'password',
  'postgres',
  'remidy',
]);

function databasePassword(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return null;
  }
}

const schema = z
  .object({
    // Unset means production, so a forgotten setting gets the strict checks.
    NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
    PORT: z.coerce
      .number({ error: 'must be a port number' })
      .int('must be a port number')
      .min(1, 'must be a port number')
      .max(65535, 'must be a port number')
      .default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
        error: 'must be one of fatal, error, warn, info, debug, trace or silent',
      })
      .default('info'),
    /** The address people use to reach Remidy. Cookies and origin checks depend on it. */
    PUBLIC_URL: z.url({
      error: 'must be the address of this app, such as https://remidy.example.com',
    }),
    /** Signs sessions. Generate one with: openssl rand -base64 48 */
    AUTH_SECRET: z.string({ error: 'is required' }).min(32, 'must be at least 32 characters'),
    /**
     * Addresses of reverse proxies in front of the app, separated by commas, such as 172.18.0.0/16.
     * Only these may say which client a request came from.
     */
    TRUST_PROXY: z.string().default(''),
    /** The mail server for password resets, such as smtp://user:password@mail.example.com:587 */
    SMTP_URL: z
      .string()
      .regex(/^smtps?:\/\//, 'must be an smtp:// or smtps:// address')
      .optional(),
    /** Who mail comes from, such as Remidy <remidy@example.com>. Needed with SMTP_URL. */
    EMAIL_FROM: z.string().min(1, 'must not be empty').optional(),
    /** Flagged features to switch on, separated by commas. */
    ENABLED_FEATURES: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z
      .string({ error: 'is required' })
      .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// connection string'),
  })
  .superRefine((env, context) => {
    if (env.SMTP_URL && !env.EMAIL_FROM) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'is required when SMTP_URL is set',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (/dev_only|replace-me|changeme/i.test(env.AUTH_SECRET)) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_SECRET'],
        message: 'needs a unique random value in production',
      });
    }
    if (!env.PUBLIC_URL.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_URL'],
        message: 'must use https in production, so session cookies stay protected',
      });
    }
    const password = databasePassword(env.DATABASE_URL);
    if (!password || UNSAFE_PASSWORDS.has(password.toLowerCase())) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'needs a strong, unique password in production',
      });
    }
  });

export type Config = z.infer<typeof schema>;

/** Names what's wrong, and never includes the values, because those can be secrets. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')} ${issue.message}`);
  throw new ConfigError(`Remidy can't start. Fix these settings:\n${problems.join('\n')}`);
}
