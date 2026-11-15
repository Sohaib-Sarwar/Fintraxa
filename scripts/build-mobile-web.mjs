/**
 * Builds the mobile app (Expo, `mobile/`) as a website under /m of this same site (owner, 2026-11-15: "make the
 * mobile version the web version on phones, installable from the browser"). Runs on Vercel after `vite build`.
 *
 *   node scripts/build-mobile-web.mjs
 *
 * 1. `npm ci` in mobile/ (Vercel installs only the root) and `expo export --platform web` into dist/m
 *    (app.config.ts `experiments.baseUrl: '/m'`, so every asset URL starts with /m/).
 * 2. Makes /m an installable app of its own: a manifest (scope + start_url /m, the site's Fintraxa icons), the
 *    iOS/Android meta tags, and a tiny network-only service worker (/m-sw.js) scoped to /m — so the web app's caching worker
 *    (scope /) never serves /m, and every open loads the newest deploy (updates are automatic).
 * Phones are sent from / to /m by the inline script in index.html.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'mobile');
const out = join(root, 'dist', 'm');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1', FINTRAXA_WEB_BASE: '/m' } });

if (!existsSync(join(root, 'dist'))) throw new Error('Run `vite build` first (dist/ is missing).');
if (!existsSync(join(mobile, 'node_modules', 'expo'))) run('npm ci --no-audit --no-fund', mobile);
run(`npx expo export --platform web --output-dir "${out}"`, mobile);

const manifest = {
  id: '/m',
  name: 'Fintraxa',
  short_name: 'Fintraxa',
  description: 'Personal Finance & Investment Management',
  // No trailing slash: the site redirects /m/ → /m (vercel.json trailingSlash: false), and a scope of '/m/' would
  // leave the /m page itself outside the installed app.
  start_url: '/m',
  scope: '/m',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#000000',
  theme_color: '#000000',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// Network-only worker: present so Chrome offers "Install app"; never caches, so each launch is the latest deploy.
// At the site root (not /m/sw.js) so its scope may be '/m' — a worker can only cover paths under its own folder.
writeFileSync(join(root, 'dist', 'm-sw.js'), [
  "self.addEventListener('install', () => self.skipWaiting());",
  "self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));",
  "self.addEventListener('fetch', () => {});",
  '',
].join('\n'));

const htmlPath = join(out, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const head = [
  '<link rel="manifest" href="/m/manifest.webmanifest" />',
  '<meta name="theme-color" content="#000000" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="Fintraxa" />',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
  '<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />',
  "<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/m-sw.js',{scope:'/m'}).catch(function(){})})}</script>",
].join('\n    ');
html = html.replace('</head>', `    ${head}\n  </head>`);
// Edge-to-edge like the native app (no pinch-zoom, content under the notch handled by safe areas).
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />');
writeFileSync(htmlPath, html);
console.log('mobile web → dist/m (installable, scope /m)');
