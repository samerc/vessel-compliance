import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          bootstrap: resolve(__dirname, 'src/main/bootstrap.ts'),
          index: resolve(__dirname, 'src/main/index.ts'),
          parser: resolve(__dirname, 'src/main/workers/parser.ts')
        },
        external: ['mysql2', 'mysql2/promise', 'better-sqlite3']
      }
    }
  },
  preload: {},
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
