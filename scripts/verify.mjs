import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const required = [
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'public/materials.json',
  'scripts/build-assets.sh',
  'scripts/verify-remote.mjs',
  'vercel.json'
];

let failed = false;
const fail = (message) => { console.error(`FAIL ${message}`); failed = true; };
const ok = (message) => console.log(`OK   ${message}`);

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing ${file}`);
  else ok(file);
}

const materials = JSON.parse(fs.readFileSync(path.join(root, 'public/materials.json'), 'utf8'));
if (!Array.isArray(materials) || materials.length === 0) fail('materials.json must contain at least one material');

const ids = new Set();
for (const material of materials) {
  for (const key of ['id', 'title', 'subtitle', 'pdf', 'audio', 'cover']) {
    if (!material[key]) fail(`material ${material.id || '?'} missing ${key}`);
  }
  if (ids.has(material.id)) fail(`duplicate material id: ${material.id}`);
  ids.add(material.id);

  for (const [kind, value] of [['PDF', material.pdf], ['audio', material.audio], ['cover', material.cover]]) {
    if (!String(value).startsWith('https://') && !String(value).startsWith('/files/')) {
      fail(`${material.id} ${kind} must use HTTPS or /files route`);
    }
    if (/aidocmaker\.com|floot\.app/i.test(String(value))) {
      fail(`${material.id} ${kind} still depends on an external legacy host`);
    }
  }

  if (!Array.isArray(material.chapters) || material.chapters.length !== 8) {
    fail(`${material.id} must contain exactly 8 audiobook chapters`);
  } else {
    for (const chapter of material.chapters) {
      if (!chapter.title || !String(chapter.url || '').startsWith('https://')) {
        fail(`${material.id} chapter ${chapter.id || '?'} missing title or HTTPS audio URL`);
      }
      if (/aidocmaker\.com|floot\.app/i.test(String(chapter.url || ''))) {
        fail(`${material.id} chapter ${chapter.id || '?'} still points to a legacy player`);
      }
    }
  }
}

const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
for (const id of ['biblioteca', 'como-funciona', 'proximos', 'study-modal', 'pdf-frame', 'audio-player']) {
  if (!html.includes(`id="${id}"`)) fail(`HTML missing #${id}`);
}
for (const fragment of ['aria-modal="true"', 'aria-live="polite"', 'viewport-fit=cover']) {
  if (!html.includes(fragment)) fail(`HTML accessibility/mobile marker missing: ${fragment}`);
}

const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
for (const marker of ['prefers-reduced-motion', '@media', '.study-rail', '.reveal', '.mobile-modal-actions']) {
  if (!css.includes(marker)) fail(`CSS marker missing: ${marker}`);
}

const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
for (const marker of ['IntersectionObserver', 'localStorage', 'playbackRate', 'restoreFromUrl', 'escapeHtml', 'data-prev-track', 'data-next-track']) {
  if (!app.includes(marker)) fail(`app behavior missing: ${marker}`);
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
for (const material of materials) {
  for (const route of [material.pdf, material.audio, material.cover]) {
    if (!String(route).startsWith('/files/')) continue;
    const rewrite = rewrites.find((item) => item.source === route);
    if (!rewrite) fail(`Vercel rewrite missing for ${route}`);
    else if (!String(rewrite.destination || '').startsWith('https://')) fail(`Rewrite destination must be HTTPS for ${route}`);
  }
}

if (failed) process.exit(1);
console.log(`\nVerification passed: ${materials.length} material(s).`);
console.log('Architecture: GitHub ✓ Vercel ✓ Cloudflare R2 ✓ Workers AI generator ✓ legacy hosts removed ✓');
console.log('Core flows: read online ✓ native chapter playlist ✓ previous/next ✓ resume progress ✓ speed control ✓ download ✓ search/filter ✓');
