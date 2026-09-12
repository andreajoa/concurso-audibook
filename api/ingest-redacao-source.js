const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Temporary, content-locked ingest endpoint used only to move the two user-supplied
// source files into the existing private R2 bucket without committing paid assets
// to this public repository. Every presigned PUT is bound to the exact SHA-256
// checksum of the intended file, so arbitrary bytes cannot be uploaded through it.
const SOURCES = {
  pdf: {
    key: 'docs/redacao-ensino-fundamental-completo-2026.pdf',
    contentType: 'application/pdf',
    checksumSha256: 'cAdt9fpOs2dyYfLjCNOqCkdfayD5fwc+flDi1aWWRbk=',
    bytes: 286235
  },
  summary: {
    key: 'redacao-nivel-fundamental-2026/resumo-como-gabaritar-redacao-nivel-fundamental.mp3',
    contentType: 'audio/mpeg',
    checksumSha256: '85GQFO89L6ymMXd7X0iVd0w+lorNegPs+z3uKldWEMQ=',
    bytes: 18006759
  }
};

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || 'dbad4dc0550693a69d5956df7344e001';
  const bucket = process.env.R2_BUCKET || 'apostila';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('R2 credentials are not configured.');
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

function client() {
  const c = r2Config();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey }
  });
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const type = String(req.query?.type || '');
    const source = SOURCES[type];
    if (!source) return res.status(400).json({ error: 'invalid type' });

    const { bucket } = r2Config();
    const s3 = client();

    if (String(req.query?.status || '') === '1') {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: source.key, ChecksumMode: 'ENABLED' }));
        return res.status(200).json({
          exists: true,
          key: source.key,
          bytes: Number(head.ContentLength || 0),
          contentType: head.ContentType || '',
          checksumSha256: head.ChecksumSHA256 || null,
          expectedBytes: source.bytes,
          expectedChecksumSha256: source.checksumSha256
        });
      } catch (error) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || status === 403) {
          return res.status(200).json({ exists: false, key: source.key, expectedBytes: source.bytes });
        }
        throw error;
      }
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: source.key,
      ContentType: source.contentType,
      ChecksumSHA256: source.checksumSha256,
      CacheControl: 'private, max-age=0, no-store'
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 10 });
    return res.status(200).json({
      uploadUrl,
      key: source.key,
      expectedBytes: source.bytes,
      headers: {
        'content-type': source.contentType,
        'x-amz-checksum-sha256': source.checksumSha256
      }
    });
  } catch (error) {
    console.error('ingest-redacao-source', error);
    return res.status(500).json({ error: 'ingest unavailable' });
  }
};
