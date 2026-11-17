import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-e2e',
      'release',
      'node_modules',
      'test-results',
      'playwright-report',
      'coverage',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.webextensions },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message: 'Build DOM nodes instead; ShieldFix never injects HTML strings.',
        },
        { property: 'outerHTML', message: 'Build DOM nodes instead.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'No HTML string injection.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-restricted-properties': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Playwright fixtures call `use()`, which is not a React hook.
    files: ['tests/e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/e2e/**/*.mjs', '*.config.{js,ts}'],
    extends: [js.configs.recommended],
    // Callbacks passed to Playwright's page.evaluate() run in the browser.
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.webextensions } },
  },
);
