import { createDatabase } from '@remidy/db';
import { buildApp } from './core/app.ts';
import { ConfigError, loadConfig, type Config } from './core/config.ts';
import { loggerOptions } from './core/logging.ts';

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
const app = buildApp({ database, logger: loggerOptions(config.LOG_LEVEL) });

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

try {
  await database.migrate();
  await app.listen({ host: '0.0.0.0', port: config.PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'Remidy could not start');
  await database.close();
  process.exit(1);
}
