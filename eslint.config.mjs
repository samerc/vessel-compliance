import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    // Plain Node CommonJS scripts (run with node, not compiled): require() is how they load
    // modules, and TypeScript return types cannot be written in .js files
    files: ['scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  {
    // Main process: never import() a package. The hot-update cache has no node_modules; the
    // bootstrap puts the installer's on NODE_PATH, which require honours but import() does not
    // (the jszip break of 2026-10-14). Relative import('./x') of our own modules is fine.
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.type="Literal"]:not([source.value=/^[.]/])',
          message:
            'Use a static import: a dynamic import() of a package fails on PCs running a hot-update.'
        },
        {
          selector: 'ImportExpression:not([source.type="Literal"])',
          message: 'import() needs a literal relative path in the main process (hot-update safety).'
        }
      ]
    }
  },
  eslintConfigPrettier
)
