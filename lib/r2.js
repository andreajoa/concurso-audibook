const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function config() {
  const accountId = process.env.R2_ACCOUNT_ID || 'dbad4dc0550693a69d5956df7344e001';
  const bucket = process.env.R2_BUCKET || 'apostila';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('R2 credentials are not configured.');
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

function client() {
  const c = config();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey }
  });
}

async function signObject(key, { downloadName, expiresIn = 60 * 60 * 6 } = {}) {
  const { bucket } = config();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(downloadName ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` } : {})
  });
  return getSignedUrl(client(), command, { expiresIn });
}

async function signedProductAssets(product) {
  const cover = await signObject(product.assets.coverKey, { expiresIn: 60 * 30 });
  const pdf = await signObject(product.assets.pdfKey);
  const pdfDownload = await signObject(product.assets.pdfKey, { downloadName: product.assets.pdfDownloadName });
  const allTracks = [product.assets.summary, ...(product.assets.chapters || [])];
  const tracks = await Promise.all(allTracks.map(async track => ({
    id: track.id,
    title: track.title,
    subtitle: track.subtitle || '',
    streamUrl: await signObject(track.key),
    downloadUrl: await signObject(track.key, { downloadName: track.downloadName }),
    downloadName: track.downloadName
  })));
  return { cover, pdf, pdfDownload, tracks };
}

module.exports = { signObject, signedProductAssets };
