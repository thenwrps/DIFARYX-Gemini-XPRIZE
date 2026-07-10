import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
  },
  optimizeDeps: {
    holdUntilCrawlEnd: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
    watch: {
      ignored: [
        '**/.venv/**',
        '**/venv/**',
        '**/server/python/**',
        '**/DIFARYX-demo/real-app/**',
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (
            normalizedId.includes('node_modules/clsx/') ||
            normalizedId.includes('node_modules/tailwind-merge/')
          ) {
            return 'ui-vendor'
          }
          if (
            normalizedId.includes('node_modules/react/') ||
            normalizedId.includes('node_modules/react-dom/') ||
            normalizedId.includes('node_modules/react-router/') ||
            normalizedId.includes('node_modules/react-router-dom/')
          ) {
            return 'react'
          }
          if (normalizedId.includes('node_modules/lucide-react')) {
            return 'icons'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
