// Run in the server's container when the admin password is lost, from /app:
//   node apps/server/src/core/auth/reset-admin-password.ts
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
