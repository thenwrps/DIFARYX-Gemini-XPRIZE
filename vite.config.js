import { defineConfig } from 'vitest/config'
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
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/DIFARYX-demo/real-app/**',
      // These existing files are standalone tsx scripts executed by npm test,
      // not Vitest suites.
      'src/evidence/__tests__/evidenceAdapters.test.ts',
      'src/utils/__tests__/localStorageSafe.test.ts',
      'src/utils/__tests__/signalParser.test.ts',
      'src/utils/__tests__/techniqueDatasetAdapters.test.ts',
      'src/agents/ramanAgent/__tests__/ramanPhaseIdentification.test.ts',
      'src/agents/xrdAgent/__tests__/codMatching.test.ts',
      'src/agents/xrdAgent/__tests__/spinelMillerIndexing.test.ts',
      'src/engines/fusionEngine/__tests__/consistencyRegistry.test.ts',
      'src/engines/fusionEngine/__tests__/fusionEngine.test.ts',
      'src/engines/fusionEngine/__tests__/uiFusionWiring.test.ts',
    ],
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
