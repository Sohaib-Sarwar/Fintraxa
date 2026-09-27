import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'Fintraxa',
        short_name: 'Fintraxa',
        description: 'Personal Finance & Investment Management',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/auth/, /supabase/],
        runtimeCaching: [
          // The market data service publishes static JSON to GitHub Pages and
          // refreshes on a schedule: PSX once per working day after the close,
          // MUFAP hourly on working evenings. StaleWhileRevalidate suits that
          // exactly — the cached copy is almost always the current one, so the
          // app opens instantly offline and still corrects itself in the
          // background. NetworkFirst (what PSX used to use) just made every
          // cold start wait on the network for a file that had not moved.
          {
            urlPattern: ({ url }) =>
              url.hostname === 'sohaib-sarwar.github.io'
              && url.pathname.includes('/PSX-MUFAP-MicroService/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'market-data',
              // 747 stocks and 553 funds across per-symbol, per-sector and
              // per-category files; 200 entries covers a deep session.
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase carries the user's own records and is authenticated —
          // never cached. Listed so nothing else adopts it by accident.
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    })
  ],
  server: { port: 5173, host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600,
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mui': ['@mui/material', '@mui/icons-material'],
          'vendor-charts': ['recharts'],
          'vendor-motion': ['framer-motion'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
