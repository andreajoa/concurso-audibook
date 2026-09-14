import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../public/', import.meta.url);
const CSS = '<link rel="stylesheet" href="/portal-news.css?v=20260914-portal">';
const JS = '<script src="/portal-news.js?v=20260914-portal" defer></script>';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

const files = await walk(ROOT.pathname);
let changed = 0;
for (const file of files) {
  let html = await readFile(file, 'utf8');
  const before = html;
  html = html.replace(/<link[^>]+href=["']\/portal-news\.css[^>]*>\s*/gi, '');
  html = html.replace(/<script[^>]+src=["']\/portal-news\.js[^>]*><\/script>\s*/gi, '');
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${CSS}</head>`);
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${JS}</body>`);
  if (html !== before) {
    await writeFile(file, html);
    changed++;
  }
}
console.log(`Portal shell injected into ${changed}/${files.length} HTML files.`);
