// Fills the development database with fictional data:
//   docker compose exec server pnpm --filter @remidy/server sample-data [--fresh]
// --fresh replaces the sample data. Anything else in the database is left alone.
import { addSampleData } from './core/sample-data.ts';
import { features } from './features/index.ts';

try {
  const report = await addSampleData(features, process.argv.slice(2));
  process.stdout.write(`Sample data is ready.\n${report.map((line) => `  ${line}`).join('\n')}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
