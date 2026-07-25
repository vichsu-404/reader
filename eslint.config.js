import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The three CLAUDE.md constraints below are enforced here rather than by
 * convention, so that violating them fails `npm run check`:
 *   1. Only src/core/coach/** may talk to Anthropic or open a network socket.
 *   2. Only src/core/db/** may import the SQL plugin (raw SQL lives in queries.ts).
 *   3. No default exports outside build config.
 */

const NETWORK_SYNTAX = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      'Network access is confined to src/core/coach/. Route this through a CoachProvider.',
  },
  {
    selector:
      "MemberExpression[object.name='globalThis'][property.name='fetch']",
    message:
      'Network access is confined to src/core/coach/. Route this through a CoachProvider.',
  },
  {
    selector:
      "NewExpression[callee.name=/^(XMLHttpRequest|WebSocket|EventSource)$/]",
    message:
      'Network access is confined to src/core/coach/. Route this through a CoachProvider.',
  },
];

const RESTRICTED_IMPORTS = {
  paths: [
    {
      name: '@anthropic-ai/sdk',
      message:
        'The Anthropic SDK may only be imported by src/core/coach/providers/anthropic.ts.',
    },
    {
      name: '@tauri-apps/plugin-sql',
      message:
        'SQL access is confined to src/core/db/. Add a typed function to queries.ts instead.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'node_modules', 'playwright-report'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { import: importPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'import/no-default-export': 'error',
      'no-restricted-syntax': ['error', ...NETWORK_SYNTAX],
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', RESTRICTED_IMPORTS],
    },
  },

  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Carve-outs: the two folders the constraints exist to protect.
  {
    files: ['src/core/coach/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: RESTRICTED_IMPORTS.paths.filter(
            (p) => p.name !== '@anthropic-ai/sdk',
          ),
        },
      ],
    },
  },
  {
    files: ['src/core/db/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: RESTRICTED_IMPORTS.paths.filter(
            (p) => p.name !== '@tauri-apps/plugin-sql',
          ),
        },
      ],
    },
  },

  // Build config and ambient module declarations legitimately default-export.
  {
    files: ['*.config.{js,ts}', '**/*.d.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
);
