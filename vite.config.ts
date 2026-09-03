import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Bé Chơi',
        short_name: 'Bé Chơi',
        description: 'Trò chơi cho bé từ 2 tuổi, chơi được khi không có mạng',
        lang: 'vi',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#fff7ed',
        theme_color: '#fb923c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // m4a: the recorded animal voices in public/sfx, so they play offline too.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,m4a}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
