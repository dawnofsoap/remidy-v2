import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Proves the project lint rules fire. The linted code here is virtual, so it never enters the app.
const eslint = new ESLint({
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
  overrideConfig: { ...tseslint.configs.disableTypeChecked, files: ['**/*.{ts,tsx}'] } as never,
});

async function rulesFiredFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'fatal');
}

const serverFeature = 'apps/server/src/features/example/service.ts';
const webFeature = 'apps/web/src/features/example/Example.tsx';

describe('dates and money in feature code', () => {
  it.each([
    ['new Date()', 'export const a = new Date();'],
    ['Date.now()', 'export const a = Date.now();'],
    [
      'toISOString()',
      'declare const d: { toISOString(): string }; export const a = d.toISOString();',
    ],
    ['parseFloat()', "export const a = parseFloat('1.5');"],
    ['Number.parseFloat()', "export const a = Number.parseFloat('1.5');"],
  ])('rejects %s', async (_name, code) => {
    expect(await rulesFiredFor(serverFeature, code)).toContain('no-restricted-syntax');
  });

  it('allows them outside features, where the domain package implements them', async () => {
    expect(
      await rulesFiredFor('apps/server/src/core/clock.ts', 'export const a = new Date();'),
    ).toEqual([]);
  });
});

describe('raw controls in web features', () => {
  it.each(['button', 'input', 'select', 'textarea', 'dialog'])('rejects <%s>', async (element) => {
    const code = `export const A = () => <${element} aria-label="x" />;`;
    expect(await rulesFiredFor(webFeature, code)).toContain('no-restricted-syntax');
  });

  it('allows the UI kit to use them', async () => {
    const code = 'export const A = () => <button type="button">x</button>;';
    expect(await rulesFiredFor('apps/web/src/ui/Button.tsx', code)).toEqual([]);
  });
});

describe('colors in the web app', () => {
  const uiFile = 'apps/web/src/ui/Example.tsx';

  it.each([
    ['a hex color in a style', "export const a = <p style={{ color: '#ff0000' }}>x</p>;"],
    ['an arbitrary hex class', 'export const a = <p className="bg-[#ffffff]">x</p>;'],
    ['an arbitrary rgb class', 'export const a = <p className="text-[rgb(1,2,3)]">x</p>;'],
    ['an arbitrary color in a template', 'export const a = <p className={`p-2 bg-[#fff]`}>x</p>;'],
    ['a leading !important', 'export const a = <p className="!p-2">x</p>;'],
    ['a trailing !important', 'export const a = <p className="p-2 text-ink!">x</p>;'],
  ])('rejects %s', async (_name, code) => {
    expect(await rulesFiredFor(uiFile, code)).toContain('no-restricted-syntax');
  });

  it('rejects them in features too', async () => {
    const code = 'export const a = <p className="bg-[#ffffff]">x</p>;';
    expect(await rulesFiredFor(webFeature, code)).toContain('no-restricted-syntax');
  });

  it.each([
    ['token classes', 'export const a = <p className="bg-surface text-ink-2 p-2">x</p>;'],
    ['arbitrary non-color values', 'export const a = <p className="w-[13px]">x</p>;'],
    ['state variants', 'export const a = <p className="data-[state=open]:bg-surface">x</p>;'],
  ])('allows %s', async (_name, code) => {
    expect(await rulesFiredFor(uiFile, code)).toEqual([]);
  });
});

describe('general rules', () => {
  it('rejects files over the size limit', async () => {
    const code = Array.from({ length: 501 }, (_, i) => `export const a${String(i)} = 1;`).join(
      '\n',
    );
    expect(await rulesFiredFor('packages/domain/src/big.ts', code)).toContain('max-lines');
  });

  it('rejects console output in app code', async () => {
    expect(await rulesFiredFor('apps/server/src/core/a.ts', "console.log('x');")).toContain(
      'no-console',
    );
  });

  it('runs accessibility rules on the web app', async () => {
    const code = 'export const A = () => <img src="x.png" />;';
    expect(await rulesFiredFor('apps/web/src/ui/Image.tsx', code)).toContain('jsx-a11y/alt-text');
  });

  it('runs hooks rules on the web app', async () => {
    const code = `
      declare const useThing: () => void;
      export function A(p: { on: boolean }) {
        if (p.on) { useThing(); }
        return null;
      }`;
    expect(await rulesFiredFor('apps/web/src/ui/A.tsx', code)).toContain(
      'react-hooks/rules-of-hooks',
    );
  });
});
