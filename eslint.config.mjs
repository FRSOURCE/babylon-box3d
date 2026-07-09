import { typescript } from '@frsource/eslint-config';
import globals from 'globals';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...typescript,
  { ignores: ['**/dist', '**/coverage', '**/node_modules', '**/docs/dist'] },
  {
    files: ['*.ts'],
    languageOptions: {
      globals: globals['shared-node-browser'],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // index.ts deliberately uses triple-slash references to pull box3d-wasm's
    // ambient module augmentations into every consumer's program -- see its
    // doc comment and the README's "Raw box3d access" section.
    files: ['index.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
];
