import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_PROXY = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:8787',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png', 'fonts/*.woff2'],
      manifest: {
        name: 'Winter_Fitness_Tracker',
        // iOS truncates the home-screen label at ~12 characters; the full
        // name above still shows in the install prompt.
        short_name: 'Winter',
        description: 'A shared daily-habit tracker for two.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#12070C',
        theme_color: '#12070C',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Phase 1 is app-shell only; there is no API to cache yet.
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    host: true,
    /*
     * The client always calls same-origin /api/*. In production Fastify serves
     * both; in dev Vite forwards to it, so no code differs between the two.
     */
    proxy: API_PROXY,
  },
  preview: {
    host: true,
    // `vite preview` serves the production bundle; the smoke run drives it
    // against a real API, so it needs the same forwarding dev has.
    proxy: API_PROXY,
  },
});
