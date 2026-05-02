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
      '@metamask/sdk',
      'ethers',
    ],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  resolve: {
    alias: {
      ethers: 'ethers',
    },
  },
  define: {
    global: 'globalThis',
  },
})