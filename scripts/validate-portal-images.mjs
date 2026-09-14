import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = new URL('../public/assets/portal/', import.meta.url);
const EXPECTED = new Set([
  'portal-hero-apostilas.webp',
  'portal-hero-concursos.webp',
  'portal-hero-ferramentas.webp',
  'portal-hero-prazos.webp',
  'portal-square-apostilas.webp',
  'portal-square-concursos.webp',
  'portal-square-ferramentas.webp',
  'portal-square-prazos.webp',
  'portal-strip-alertas.webp',
  'portal-strip-edital.webp',
  'portal-strip-materiais.webp',
  'portal-strip-simulados.webp',
  'portal-top-como-estudar.webp',
  'portal-top-duvidas.webp',
  'portal-top-glossario.webp',
  'portal-top-materias.webp'
]);

function readWebpSize(data, name) {
  if (data.length < 30 || data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error(`${name}: assinatura RIFF/WEBP inválida`);
  }

  let offset = 12;
  while (offset + 8 <= data.length) {
    const type = data.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkSize;
    if (end > data.length) throw new Error(`${name}: chunk WebP truncado`);
    const payload = data.subarray(start, end);

    if (type === 'VP8X') {
      if (payload.length < 10) throw new Error(`${name}: VP8X inválido`);
      return [1 + payload.readUIntLE(4, 3), 1 + payload.readUIntLE(7, 3)];
    }

    if (type === 'VP8 ') {
      const marker = Buffer.from([0x9d, 0x01, 0x2a]);
      const i = payload.indexOf(marker);
      if (i < 0 || i + 7 > payload.length) throw new Error(`${name}: cabeçalho VP8 inválido`);
      return [payload.readUInt16LE(i + 3) & 0x3fff, payload.readUInt16LE(i + 5) & 0x3fff];
    }

    if (type === 'VP8L') {
      if (payload.length < 5 || payload[0] !== 0x2f) throw new Error(`${name}: cabeçalho VP8L inválido`);
      const bits = payload.readUInt32LE(1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }

    offset += 8 + chunkSize + (chunkSize & 1);
  }
  throw new Error(`${name}: dimensões WebP não encontradas`);
}

const names = (await readdir(ROOT)).filter(name => name.endsWith('.webp')).sort();
if (names.length !== EXPECTED.size) throw new Error(`Esperadas ${EXPECTED.size} imagens WebP; encontradas ${names.length}`);
for (const name of EXPECTED) if (!names.includes(name)) throw new Error(`Imagem obrigatória ausente: ${name}`);
for (const name of names) if (!EXPECTED.has(name)) throw new Error(`Imagem WebP inesperada: ${name}`);

for (const name of names) {
  const file = new URL(name, ROOT);
  const data = await readFile(file);
  const info = await stat(file);
  if (!info.isFile() || data.length !== info.size || data.length < 10_000) throw new Error(`${name}: arquivo incompleto ou tamanho inválido`);

  const [width, height] = readWebpSize(data, name);
  const expected = name.includes('square-') ? [1254, 1254] : [2172, 724];
  if (width !== expected[0] || height !== expected[1]) {
    throw new Error(`${name}: dimensões ${width}x${height}; esperado ${expected[0]}x${expected[1]}`);
  }

  const digest = createHash('sha256').update(data).digest('hex');
  console.log(`OK ${name}: WEBP ${width}x${height}, ${data.length} bytes, sha256=${digest}`);
}

const portalJs = await readFile(new URL('../public/portal-news.js', import.meta.url), 'utf8');
if (/data:image\//i.test(portalJs) || /;base64,/i.test(portalJs)) throw new Error('portal-news.js contém imagem inline/Base64');
if (/margareth-5-estrategias\.floot\.app/i.test(portalJs)) throw new Error('portal-news.js contém referência Floot');

const referenced = [...portalJs.matchAll(/portal-[a-z0-9-]+\.webp/g)].map(match => match[0]);
for (const name of new Set(referenced)) {
  if (!EXPECTED.has(name)) throw new Error(`portal-news.js referencia imagem não validada: ${name}`);
}

console.log(`Validação concluída: ${names.length} imagens binárias WebP íntegras e dimensões corretas.`);
