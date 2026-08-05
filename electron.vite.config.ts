import { resolve } from 'path'
import { createRequire } from 'module'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    assetsInclude: ['**/*.bene'],
    resolve: {
      alias: {
        'node:module': resolve('empty-module.ts'),
        '@renderer': resolve('src/renderer/src'),
        derakuma: require.resolve('derakuma')
      }
    },
    plugins: [react()],
    optimizeDeps: {
      exclude: ['derakuma']
    }
  }
})
