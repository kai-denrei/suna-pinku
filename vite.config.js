import process from 'node:process'
import { defineConfig } from 'vite'

// Precache the complete build, including the dynamic runtime and audio worklet.
// The manifest hash changes on every asset change; updates activate on next launch.
function offlineBundle() {
  let base = '/'
  return {
    name: 'pinku-offline',
    configResolved(config) { base = config.base },
    async generateBundle(_, bundle) {
      const { createHash } = await import('node:crypto')
      const { readFile } = await import('node:fs/promises')
      const publicPaths = ['/fonts/caveat.ttf', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', '/scene_assets/beach.mp3', '/scene_assets/wave.mp3']
      const hash = createHash('sha256')
      hash.update(base)
      hash.update(await readFile('index.html'))
      hash.update(await readFile('vite.config.js'))
      for (const item of Object.values(bundle)) hash.update(item.type === 'chunk' ? item.code : item.source)
      for (const path of publicPaths) hash.update(await readFile(`public${path}`))
      const version = hash.digest('hex').slice(0, 16)
      const urls = [base, ...Object.keys(bundle).map(path => `${base}${path}`), ...publicPaths.map(path => `${base}${path.slice(1)}`)]
      const prefix = `pinku-${base}-`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const PREFIX = ${JSON.stringify(prefix)};
const CACHE = PREFIX + '${version}';
const BASE = ${JSON.stringify(base)};
const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (event.request.mode === 'navigate') return (await cache.match(BASE)) || fetch(event.request);
    return (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request);
  }));
});` })
    },
  }
}

export default defineConfig({ base: process.env.SITE_BASE_PATH || '/', plugins: [offlineBundle()], server: { host: '127.0.0.1' } })
