import { createDatabase } from '@remidy/db';
import { buildApp } from './core/app.ts';
import { adminPasswordNotice, ensureAdminAccount } from './core/auth/admin.ts';
import { createAuth, createAuthorize } from './core/auth/index.ts';
import { signInOptionsFeature } from './core/auth/sign-in-options.ts';
import { ConfigError, loadConfig, type Config } from './core/config.ts';
import { loggerOptions } from './core/logging.ts';
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

const config = readConfig();
const database = createDatabase(config.DATABASE_URL);
const auth = createAuth({
  orm: database.orm,
  secret: config.AUTH_SECRET,
  publicUrl: config.PUBLIC_URL,
});
const app = buildApp({
  database,
  logger: loggerOptions(config.LOG_LEVEL),
  features: [signInOptionsFeature({ orm: database.orm }), ...features],
  enabledFeatures: config.ENABLED_FEATURES,
  authorize: createAuthorize(auth, database.orm),
  auth: { auth, orm: database.orm },
  publicUrl: config.PUBLIC_URL,
  trustProxy: config.TRUST_PROXY,
});

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

try {
  await database.migrate();
  const adminPassword = await ensureAdminAccount(auth);
  if (adminPassword) process.stdout.write(adminPasswordNotice(adminPassword));
  await app.listen({ host: '0.0.0.0', port: config.PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'Remidy could not start');
  await database.close();
  process.exit(1);
}
