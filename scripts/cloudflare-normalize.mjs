import { readFile, writeFile } from 'node:fs/promises';

const ORIGIN = 'https://www.concursotrilhaaprova.online';
const PUBLIC_HOST = new URL(ORIGIN).host;

const catalogPath = new URL('../products/catalog.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
let catalogChanged = false;

for (const [slug, product] of Object.entries(catalog)) {
  const cover = product?.storefront?.cover3d;
  if (typeof cover !== 'string' || !product?.assets?.coverKey) continue;
  let external = false;
  try {
    const parsed = new URL(cover, ORIGIN);
    external = parsed.host && parsed.host !== PUBLIC_HOST;
  } catch {
    external = false;
  }
  if (external) {
    product.storefront.cover3d = `${ORIGIN}/api/cover?slug=${encodeURIComponent(slug)}`;
    catalogChanged = true;
  }
}

if (catalogChanged) {
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
}

const seoPath = new URL('./build-seo.cjs', import.meta.url);
let seo = await readFile(seoPath, 'utf8');
seo = seo.replace(/const CDN = ['"]https?:\/\/[^'"]+['"];?/, 'const CDN = ORIGIN;');
await writeFile(seoPath, seo);

console.log(`Cloudflare R2 normalization complete; catalogChanged=${catalogChanged}`);
