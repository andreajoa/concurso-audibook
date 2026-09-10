import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];

let failed = false;
const fail = (message) => { console.error(`FAIL ${message}`); failed = true; };
const ok = (message) => console.log(`OK   ${message}`);

for (const rewrite of rewrites) {
  const destination = String(rewrite.destination || '');
  if (!destination.startsWith('https://')) continue;

  try {
    const head = await fetch(destination, { method: 'HEAD', redirect: 'follow' });
    if (!head.ok) {
      fail(`${rewrite.source} upstream returned ${head.status}`);
      continue;
    }

    const type = head.headers.get('content-type') || 'unknown';
    const length = Number(head.headers.get('content-length') || 0);
    if (!length) fail(`${rewrite.source} upstream has no content length`);
    else ok(`${rewrite.source} → ${type} • ${length} bytes`);

    if (/\.(pdf|mp3|m4a|opus)$/i.test(rewrite.source)) {
      const range = await fetch(destination, {
        headers: { Range: 'bytes=0-31' },
        redirect: 'follow'
      });
      const bytes = (await range.arrayBuffer()).byteLength;
      if (range.status !== 206 || bytes !== 32) {
        fail(`${rewrite.source} does not support byte-range delivery (status ${range.status}, ${bytes} bytes)`);
      } else {
        ok(`${rewrite.source} byte-range streaming`);
      }
    }
  } catch (error) {
    fail(`${rewrite.source} upstream check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exit(1);
console.log('\nRemote asset verification passed.');
