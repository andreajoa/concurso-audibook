const crypto = require('node:crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getProduct } = require('../lib/catalog');
const { signObject } = require('../lib/r2');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'dbad4dc0550693a69d5956df7344e001';
const BUCKET = process.env.R2_BUCKET || 'apostila';
const SLUG = 'professor-adjunto-i-ibam-santos-2026';

// Temporary, hash-locked staging map. Every accepted payload must match the
// exact bytes supplied by the owner in this release. The route is removed
// before the branch can merge to main.
const STAGING = {
  pdf: {
    size: 1394810,
    sha256: 'dd6ff571fd63e2d1da58e8f0f3d7699d154aa9ad06e190b706180655d276e809',
    key: `${SLUG}/staging/source.pdf`,
    contentType: 'application/pdf'
  },
  cover: {
    size: 2226830,
    sha256: 'ffb24a6d1c9a8cc8eda4eaadc37a68a6474e105f07d9790c77bbb416f85da013',
    key: `${SLUG}/staging/cover.png`,
    contentType: 'image/png',
    png: { width: 1122, height: 1402 }
  },
  'summary-00': { size: 3000000, sha256: '6526609314407693b6c580ce9780eb8ca6b64e8cdbd0d0b1864b716b530ec4be', key: `${SLUG}/staging/summary.part00`, contentType: 'application/octet-stream' },
  'summary-01': { size: 3000000, sha256: '2720345b1e0eba79606b52dd110380b800580426feda45135442d035573a5a18', key: `${SLUG}/staging/summary.part01`, contentType: 'application/octet-stream' },
  'summary-02': { size: 3000000, sha256: '9e36205af908cf7870e5f9818d5cbb7039e12c72b399e52755f4278d2637f140', key: `${SLUG}/staging/summary.part02`, contentType: 'application/octet-stream' },
  'summary-03': { size: 3000000, sha256: '9bc631c78f063b3deba8662d15e86a896e1c9ad6417e3fa40ad9a37b959c6172', key: `${SLUG}/staging/summary.part03`, contentType: 'application/octet-stream' },
  'summary-04': { size: 3000000, sha256: '4d057c6b276218416795e0c93386cb446ce5d98d79e3b6637cac3de8d6c0e9b8', key: `${SLUG}/staging/summary.part04`, contentType: 'application/octet-stream' },
  'summary-05': { size: 1295946, sha256: 'e2d23df4a61d704ab437950a5b51d948f970b6ad952f2a9affe44d3b83e4c0e2', key: `${SLUG}/staging/summary.part05`, contentType: 'application/octet-stream' }
};

function s3Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('R2 credentials are not configured.');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'latin1');
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validatePng(buffer, spec) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) throw new Error('Invalid PNG signature.');
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG IHDR missing.');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== spec.png.width || height !== spec.png.height) throw new Error(`Unexpected PNG dimensions: ${width}x${height}`);
}

async function stageProfessorMedia(req, res) {
  const kind = String(req.query?.kind || '');
  const spec = STAGING[kind];
  if (!spec) return res.status(404).json({ ok: false, error: 'Unknown staging object.' });
  const body = await rawBody(req);
  if (body.length !== spec.size) return res.status(400).json({ ok: false, error: `Unexpected size for ${kind}.` });
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  if (sha256 !== spec.sha256) return res.status(400).json({ ok: false, error: `SHA-256 mismatch for ${kind}.` });
  if (kind === 'pdf' && body.subarray(0, 5).toString('ascii') !== '%PDF-') return res.status(400).json({ ok: false, error: 'Invalid PDF signature.' });
  if (kind === 'cover') validatePng(body, spec);

  await s3Client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: spec.key,
    Body: body,
    ContentType: spec.contentType,
    CacheControl: 'private, no-store',
    Metadata: { sha256: spec.sha256, release: 'professor-adjunto-i-santos-2026' }
  }));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(201).json({ ok: true, kind, bytes: body.length, sha256, key: spec.key });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST' && String(req.query?.stage || '') === 'professor-2026') {
      return await stageProfessorMedia(req, res);
    }
    const slug = String(req.query?.slug || 'autores-ibam-2026');
    const product = getProduct(slug);
    if (!product) return res.status(404).end('Not found');
    const url = await signObject(product.assets.coverKey, { expiresIn: 60 * 30 });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.statusCode = 302;
    res.setHeader('Location', url);
    return res.end();
  } catch (error) {
    console.error('cover', error);
    return res.status(500).json({ ok: false, error: 'Cover/media staging unavailable.' });
  }
};
