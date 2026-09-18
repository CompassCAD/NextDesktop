import { resolve } from 'path'
import { createRequire } from 'module'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
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
        derakuma: require.resolve('derakuma'),
        fengari: require.resolve('fengari-web'),
      }
    },
    plugins: [
      react(),
      nodePolyfills({
        include: ['os', 'path', 'buffer'], // Includes polyfill for 'os'
        globals: {
          process: false, // Prevents overwriting window.process
          Buffer: true,
          global: true,
        },
      })
    ],

    optimizeDeps: {
      include: ['fengari', 'fengari-interop'],
      exclude: ['derakuma']
    }
  }
})
