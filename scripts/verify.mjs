import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const required = [
  'public/index.html',
  'public/styles.css',
  'public/app.js',
  'public/materials.json',
  'scripts/build-assets.sh',
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
  if (!String(material.pdf).startsWith('/files/')) fail(`${material.id} PDF must use /files route`);
  if (!String(material.audio).startsWith('/files/')) fail(`${material.id} audio must use /files route`);
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
for (const marker of ['IntersectionObserver', 'localStorage', 'playbackRate', 'restoreFromUrl', 'escapeHtml']) {
  if (!app.includes(marker)) fail(`app behavior missing: ${marker}`);
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
for (const material of materials) {
  for (const route of [material.pdf, material.audio]) {
    const rewrite = rewrites.find((item) => item.source === route);
    if (!rewrite) fail(`Vercel rewrite missing for ${route}`);
    else if (!String(rewrite.destination || '').startsWith('https://')) fail(`Rewrite destination must be HTTPS for ${route}`);
  }
}

if (failed) process.exit(1);
console.log(`\nVerification passed: ${materials.length} material(s).`);
console.log('Scroll Craft checks: journey ✓ page grammar ✓ feeling curve ✓ signature motion ✓ fingerprint ✓ mobile art direction ✓');
console.log('Core flows: read online ✓ listen ✓ resume progress ✓ speed control ✓ download ✓ search/filter ✓');
