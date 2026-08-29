import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Flat config. The app is plain JSX with no framework beyond React, so the
// useful rules are: nothing unused (this is how a stale import survived a
// refactor and broke the build), and the hooks rules.
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Components referenced only in JSX count as used.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^React$' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // ANSI escapes are stripped on purpose (CLI output reaches the UI).
      'no-control-regex': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'worker/**/*.js', 'vite.config.js', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.serviceworker },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
    },
  },
]
