import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // deck.gl layer accessors (getPosition/getColor/…) are idiomatically typed
      // as `any`; fully typing them is noise for this codebase.
      '@typescript-eslint/no-explicit-any': 'off',
      // shadcn ui primitives export their cva variants alongside the component.
      'react-refresh/only-export-components': 'off',
    },
  },
])
