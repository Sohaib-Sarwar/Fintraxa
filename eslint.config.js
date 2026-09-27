import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    settings: { react: { version: 'detect' } },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Without these two, `no-unused-vars` cannot see an identifier that is
      // only ever referenced from JSX. The config previously worked around
      // that with `varsIgnorePattern: '^[A-Z_]'`, which silenced every
      // capitalised import — so a genuinely unused component import was
      // invisible, while lower-case JSX values like framer-motion's `motion`
      // were still reported as unused despite being used on every page.
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',

      // `_`-prefixed names are a deliberate "I know, I'm skipping this"
      // marker — positional args and destructured keys that exist only to
      // reach the ones after them.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
])
