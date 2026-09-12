import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { devApi } from './server/viteDevApi'

export default defineConfig({
  plugins: [
    react(),
    // Serves /api/* locally with the same handler code Vercel runs in production,
    // so `npm run dev` exercises the real OCR path instead of a mock.
    devApi(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Spelling Coach — scan, pick, practise',
        short_name: 'Spelling Coach',
        description: 'Photograph a spelling list, pick the words, then practise spelling by ear.',
        theme_color: '#FF5722',
        background_color: '#FFF3E0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['education', 'kids'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Scan words', short_name: 'Scan', url: '/scan' },
          { name: 'Spelling test', short_name: 'Test', url: '/test' },
          { name: 'My words', short_name: 'Words', url: '/words' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The Firebase SDK is ~700 KB and is only fetched when a Firebase
        // config exists. Precaching it would cost every local-only user that
        // download on first visit, so it is cached on first use instead.
        globIgnores: ['**/firebase-*.js'],
        navigateFallbackDenylist: [/^\/api\//],
        // Tesseract's wasm core and language data are large; cache them on first
        // use so offline OCR keeps working without a second download.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /\/api\//, handler: 'NetworkOnly' },
          // Neural voice clips. A child hears the same handful of words many
          // times, so caching them makes practice instant and lets a word that
          // has been heard once still be heard offline.
          {
            urlPattern: /^https:\/\/api\.streamelements\.com\/kappa\/v2\/speech/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'voice-clips',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/firebase-.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'firebase-sdk', cacheableResponse: { statuses: [0, 200] } },
          },
          { urlPattern: /^https:\/\/(firestore|identitytoolkit)\.googleapis\.com\//, handler: 'NetworkOnly' },
          {
            urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\/.*(tesseract|tessdata).*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-engine',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom', 'react-router-dom'],
          ocr: ['tesseract.js'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
  server: { port: 5173, host: true },
})
