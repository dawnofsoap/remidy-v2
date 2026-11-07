import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Proves each boundary rule fires, using the deliberately bad imports in ./fixtures.
const root = fileURLToPath(new URL('../..', import.meta.url));
const cli = join(root, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');

interface Violation {
  from: string;
  to: string;
  rule: { name: string };
}

function findViolations(): Violation[] {
  const output = execFileSync(
    process.execPath,
    [
      cli,
      'tooling/rule-tests/fixtures',
      '--config',
      '.dependency-cruiser.mjs',
      '--output-type',
      'json',
      '--no-progress',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 50_000_000 },
  );
  const result = JSON.parse(output) as { summary: { violations: Violation[] } };
  return result.summary.violations;
}

describe('boundary rules', () => {
  const violations = findViolations();
  const fired = (rule: string, fromFile: string) =>
    violations.some((v) => v.rule.name === rule && v.from.endsWith(fromFile));

  it.each([
    ['core-not-to-features', 'apps/server/src/core/bad-core.ts'],
    ['ui-not-to-features', 'apps/web/src/ui/BadUi.ts'],
    ['feature-public-interface', 'apps/server/src/features/billing/reaches-into-other.ts'],
    ['features-not-to-fastify', 'apps/server/src/features/billing/bad-framework.ts'],
    ['packages-not-to-apps', 'packages/contracts/src/bad-app-import.ts'],
    ['domain-is-pure', 'packages/domain/src/bad-io.ts'],
    ['contracts-stay-shared', 'packages/contracts/src/bad-db-import.ts'],
    ['db-access-only-from-repos', 'apps/server/src/features/billing/service.ts'],
    ['db-access-only-from-repos', 'apps/server/src/features/billing/repo-notes.ts'],
    ['db-driver-only-in-db-package', 'apps/server/src/features/billing/bad-driver.ts'],
    ['web-not-to-server', 'apps/web/src/features/billing/bad-server-import.ts'],
    ['server-not-to-web', 'apps/server/src/core/bad-web-import.ts'],
    ['no-circular', 'apps/server/src/features/billing/cycle-a.ts'],
  ])('%s fires for %s', (rule, fromFile) => {
    expect(fired(rule, fromFile)).toBe(true);
  });

  it.each([
    ['importing a feature through index.ts', 'apps/server/src/features/billing/good-import.ts'],
    ['a repo using the database', 'apps/server/src/features/billing/repo.ts'],
    ['a named repo using the database', 'apps/server/src/features/billing/payments.repo.ts'],
    ['a test helper using the database and Fastify', 'apps/server/src/features/billing/testing.ts'],
    ['the db package using the driver', 'packages/db/src/index.ts'],
    ['importing within a feature', 'apps/server/src/features/other/index.ts'],
  ])('allows %s', (_name, fromFile) => {
    expect(violations.filter((v) => v.from.endsWith(fromFile))).toEqual([]);
  });
});
