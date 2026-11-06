import js from '@eslint/js';
import { fixupPluginRules } from '@eslint/compat';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Dates and money must go through packages/domain.
const bannedInFeatures = [
  {
    selector: "NewExpression[callee.name='Date']",
    message: 'Use the date types from @remidy/domain, not Date.',
  },
  {
    selector: "CallExpression[callee.object.name='Date']",
    message: 'Use the date types from @remidy/domain, not Date.',
  },
  {
    selector: "CallExpression[callee.property.name='toISOString']",
    message: 'Use the date types from @remidy/domain, not toISOString.',
  },
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: 'Use the money helpers from @remidy/domain, not parseFloat.',
  },
  {
    selector: "CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
    message: 'Use the money helpers from @remidy/domain, not Number.parseFloat.',
  },
];

// Features build screens from the shared kit, so raw controls can't drift apart.
const bannedElements = ['button', 'input', 'select', 'textarea', 'dialog'].map((element) => ({
  selector: `JSXOpeningElement[name.name='${element}']`,
  message: `Use the component from apps/web/src/ui instead of a raw <${element}>.`,
}));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'tooling/rule-tests/fixtures/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'no-console': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      'jsx-a11y': fixupPluginRules(jsxA11y),
      'react-hooks': fixupPluginRules(reactHooks),
    },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['apps/server/src/features/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...bannedInFeatures] },
  },
  {
    files: ['apps/web/src/features/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...bannedInFeatures, ...bannedElements] },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tooling/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
