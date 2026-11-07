import { execSync } from 'node:child_process';

export const STACK =
  'docker compose -p remidy-prodcheck -f deploy/compose.yaml -f deploy/check/compose.yaml --env-file deploy/check/check.env';

export const REPO_ROOT = '../..';

export const compose = (args: string) =>
  execSync(`${STACK} ${args}`, { encoding: 'utf8', cwd: REPO_ROOT, stdio: 'pipe' });

export const passwordIn = (output: string) => /Password: (\S+)/.exec(output)?.[1];
