import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:8787',
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      // SECURITY: Do NOT inject API keys into frontend!
      // Only inject the API base URL - all API calls go through secure backend proxy
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // OPTIMIZATION: Build optimizations for production
      build: {
        // Enable minification
        minify: isProduction ? 'terser' : false,
        terserOptions: isProduction ? {
          compress: {
            drop_console: false, // Keep console.log for debugging (set true to remove)
            drop_debugger: true,
            pure_funcs: ['console.debug'], // Remove console.debug in production
          },
        } : undefined,

        // Chunk splitting for better caching
        rollupOptions: {
          output: {
            manualChunks: {
              // Split vendor code
              'react-vendor': ['react', 'react-dom'],
              // Split AI services
              'ai-services': [
                './services/geminiService.ts',
                './services/classGenerator.ts',
              ],
              // Split FAL services
              'fal-services': [
                './services/falService.ts',
                './services/falAudioClient.ts',
                './services/spriteGenerator.ts',
                './services/sceneImageGenerator.ts',
              ],
              // Split game logic
              'game-logic': [
                './services/roomGenerator.ts',
                './services/mapGenerator.ts',
                './services/biomeService.ts',
              ],
            },
          },
        },

        // Target modern browsers for smaller bundles
        target: 'es2020',

        // Increase chunk size warning limit
        chunkSizeWarningLimit: 1000,

        // Source maps for debugging (disable in production if needed)
        sourcemap: !isProduction,
      },

      // OPTIMIZATION: Dependency optimization
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
        ],
        // Force pre-bundling of these deps
        force: false,
      },
    };
});
