import { createDatabase } from '@remidy/db';
import { buildApp } from './core/app.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const database = createDatabase(databaseUrl);
const app = buildApp({ database, logger: true });

async function shutdown(): Promise<void> {
  await app.close();
  await database.close();
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
