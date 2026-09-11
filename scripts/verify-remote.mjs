import fs from 'node:fs';

const materials = JSON.parse(fs.readFileSync('public/materials.json', 'utf8'));
let failed = false;
const fail = (message) => { console.error(`FAIL ${message}`); failed = true; };
const ok = (message) => console.log(`OK   ${message}`);

const assets = [];
for (const material of materials) {
  assets.push({ label: `${material.id} cover`, url: material.cover, stream: false });
  assets.push({ label: `${material.id} PDF`, url: material.pdf, stream: true });
  assets.push({ label: `${material.id} summary`, url: material.audio, stream: true });
  for (const chapter of material.chapters || []) {
    assets.push({ label: `${material.id} ${chapter.id}`, url: chapter.url, stream: true });
  }
}

const unique = [...new Map(assets.map(item => [item.url, item])).values()];

for (const asset of unique) {
  const url = String(asset.url || '');
  if (!url.startsWith('https://')) {
    fail(`${asset.label} is not a direct HTTPS asset: ${url}`);
    continue;
  }
  if (/aidocmaker\.com|floot\.app/i.test(url)) {
    fail(`${asset.label} still uses a legacy host: ${url}`);
    continue;
  }

  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!head.ok) {
      fail(`${asset.label} returned ${head.status}`);
      continue;
    }

    const type = head.headers.get('content-type') || 'unknown';
    const length = Number(head.headers.get('content-length') || 0);
    if (!length) fail(`${asset.label} has no content length`);
    else ok(`${asset.label} → ${type} • ${length} bytes`);

    if (asset.stream) {
      const range = await fetch(url, {
        headers: { Range: 'bytes=0-31' },
        redirect: 'follow'
      });
      const bytes = (await range.arrayBuffer()).byteLength;
      if (range.status !== 206 || bytes !== 32) {
        fail(`${asset.label} does not support byte-range delivery (status ${range.status}, ${bytes} bytes)`);
      } else {
        ok(`${asset.label} byte-range streaming`);
      }
    }
  } catch (error) {
    fail(`${asset.label} check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exit(1);
console.log(`\nRemote asset verification passed: ${unique.length} Cloudflare R2 asset(s).`);
