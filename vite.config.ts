import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const buildTime = new Date().toISOString();

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        /**
         * Keep an update small. Left to itself Rollup puts the code the games share into
         * the entry chunk — the one that also holds the list of game chunks by their
         * hashed names. Change one game and its name changes, so the entry's hash does,
         * so every game importing from the entry does: forty-odd files re-downloaded for
         * a one-line fix. With the shared code in a chunk of its own, which names no
         * game, a change stays in the chunks it touched. The games' meta.ts files count
         * as shared too: the home screen lists them all, and each game imports its own.
         */
        manualChunks(id) {
          if (id.includes('/src/core/') || id.includes('vite/preload-helper')) return 'core';
          if (/\/src\/games\/[^/]+\/meta\.ts$/.test(id)) return 'meta';
          return undefined;
        },
      },
    },
  },
  plugins: [
    {
      // What the server is serving now, for the app to compare with what it is running
      // (app/updateCheck.ts). Not precached, and fetched past every cache, so it is always
      // the live answer.
      name: 'version-json',
      // The build time goes into index.html, not into the JavaScript: a stamp in the main
      // chunk changes its hash every build, every game chunk imports it, and so every
      // update would re-download all of them for nothing. See app/buildTime.ts.
      transformIndexHtml() {
        return [{ tag: 'meta', attrs: { name: 'build-time', content: buildTime }, injectTo: 'head' }];
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildTime, version: pkg.version }) });
      },
    },
    VitePWA({
      // A new build waits to be let in (the notice on the home screen) rather than
      // reloading the page by itself, which would drop a child out of a game.
      registerType: 'prompt',
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
        // …except the background loops of Bé tạo cảnh: seven megabytes nobody has
        // asked for yet. Each is kept the first time it plays, so the ones a child
        // actually uses work offline from then on.
        globIgnores: ['**/ambience/**'],
        runtimeCaching: [
          {
            urlPattern: /\/ambience\/[\w-]+\.m4a$/,
            handler: 'CacheFirst',
            options: { cacheName: 'ambience', expiration: { maxEntries: 60 } },
          },
          {
            // The photographs it can play over: same deal, kept once seen.
            urlPattern: /\/backdrops\/[\w-]+\.jpg$/,
            handler: 'CacheFirst',
            options: { cacheName: 'backdrops', expiration: { maxEntries: 60 } },
          },
        ],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
