// Run on the server when the admin password is lost: pnpm --filter @remidy/server reset-admin-password
import { createDatabase } from '@remidy/db';
import { loadConfig } from '../config.ts';
import { adminPasswordNotice, resetAdminPassword } from './admin.ts';
import { createAuth } from './index.ts';

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
try {
  await database.migrate();
  const auth = createAuth({
    orm: database.orm,
    secret: config.AUTH_SECRET,
    publicUrl: config.PUBLIC_URL,
  });
  process.stdout.write(adminPasswordNotice(await resetAdminPassword(auth, database.orm)));
} finally {
  await database.close();
}
