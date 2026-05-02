import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    target: 'es2020',
  },
  optimizeDeps: {
    include: [
      'ethers',
    ],
    // @iexec-nox/handle is dynamically imported — let Vite handle it as native ESM
    exclude: ['@iexec-nox/handle'],
    esbuildOptions: {
      target: 'es2020',
      define: {
        global: 'globalThis',
      },
    },
  },
  resolve: {
    alias: {
      ethers: 'ethers',
    },
  },
  define: {
    // Provide Node.js globals for browser-bundled packages
    global: 'globalThis',
    'process.env': '{}',
    'process.version': '"v18.0.0"',
    'process.platform': '"browser"',
    'process.browser': 'true',
  },
})