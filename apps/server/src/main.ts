import { createDatabase } from '@remidy/db';
import { buildApp } from './core/app.ts';
import { adminStartupMessage } from './core/auth/admin.ts';
import { signInCleanupJob } from './core/auth/cleanup.ts';
import { createAuth, createAuthorize } from './core/auth/index.ts';
import { signInOptionsFeature } from './core/auth/sign-in-options.ts';
import { ConfigError, loadConfig, type Config } from './core/config.ts';
import { createJobRunner, heartbeatJob, jobsOfFeatures, jobStatusFeature } from './core/jobs.ts';
import { loggerOptions } from './core/logging.ts';
import { createConsoleMailer, createSmtpMailer, type Mailer } from './core/mail.ts';
import { features } from './features/index.ts';

function readConfig(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

function chooseMailer({ SMTP_URL, EMAIL_FROM, NODE_ENV }: Config): Mailer | null {
  if (SMTP_URL && EMAIL_FROM) return createSmtpMailer(SMTP_URL, EMAIL_FROM);
  return NODE_ENV === 'production' ? null : createConsoleMailer();
}

const config = readConfig();
const database = createDatabase(config.DATABASE_URL);
const mailer = chooseMailer(config);
const auth = createAuth({
  orm: database.orm,
  secret: config.AUTH_SECRET,
  publicUrl: config.PUBLIC_URL,
  mailer,
  onMailFailure: (error) => {
    app.log.error({ err: error }, 'A password reset email could not be sent');
  },
});
const jobs = [
  heartbeatJob,
  signInCleanupJob(database.orm),
  ...jobsOfFeatures(features, config.ENABLED_FEATURES, { database }),
];
const app = buildApp({
  database,
  logger: loggerOptions(config.LOG_LEVEL),
  features: [
    signInOptionsFeature({ orm: database.orm, passwordReset: mailer !== null }),
    jobStatusFeature({ orm: database.orm, jobs }),
    ...features,
  ],
  enabledFeatures: config.ENABLED_FEATURES,
  authorize: createAuthorize(auth, database.orm),
  auth: { auth, orm: database.orm, passwordReset: mailer !== null },
  publicUrl: config.PUBLIC_URL,
  trustProxy: config.TRUST_PROXY,
  webRoot: config.WEB_ROOT,
});

const jobRunner = createJobRunner({
  connectionString: config.DATABASE_URL,
  orm: database.orm,
  jobs,
  log: app.log,
});

async function shutdown(): Promise<void> {
  await jobRunner.stop();
  await app.close();
  await database.close();
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

try {
  await database.migrate();
  const adminMessage = await adminStartupMessage(auth, database.orm);
  if (adminMessage) process.stdout.write(adminMessage);
  if (!mailer) app.log.warn('SMTP_URL isn’t set, so password reset is unavailable');
  await jobRunner.start();
  // Right away, so that the status page has something true to show after a restart.
  await jobRunner.runNow(heartbeatJob.name);
  await app.listen({ host: '0.0.0.0', port: config.PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'Remidy could not start');
  await database.close();
  process.exit(1);
}
