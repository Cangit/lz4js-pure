// @ts-check

import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginSecurity from 'eslint-plugin-security';

export default [
  { languageOptions: { globals: globals.node } },
  {
    ignores: ['node_modules', 'build/', 'dist/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  pluginSecurity.configs.recommended,
  {
    rules: {
      'security/detect-object-injection': 'off',
    },
  },
];
