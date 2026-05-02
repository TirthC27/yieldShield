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
    exclude: ['@iexec-nox/handle'],
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