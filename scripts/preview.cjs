#!/usr/bin/env node
/*
 * Servidor de pré-visualização do que está em public/.
 *
 * Existe por um motivo só: a Vercel serve este site com `cleanUrls`, ou seja,
 * /concursos/sp/santos entrega concursos/sp/santos.html. Qualquer servidor
 * estático comum devolveria 404 nessas URLs, e conferir o layout numa página
 * que não abre não prova nada. Aqui a mesma regra é aplicada localmente, para
 * que o que eu vejo no navegador seja o que o visitante vai ver.
 *
 *     node scripts/preview.cjs [porta]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function resolver(urlPath) {
  const limpo = decodeURIComponent(urlPath.split('?')[0]);
  // Impede que ../.. saia de public/: o caminho é normalizado e conferido.
  const alvo = path.normalize(path.join(RAIZ, limpo));
  if (!alvo.startsWith(RAIZ)) return null;
  for (const tentativa of [alvo, alvo + '.html', path.join(alvo, 'index.html')]) {
    if (fs.existsSync(tentativa) && fs.statSync(tentativa).isFile()) return tentativa;
  }
  return null;
}

const porta = Number(process.argv[2] || 4321);
http.createServer((req, res) => {
  const arquivo = resolver(req.url === '/' ? '/index.html' : req.url);
  if (!arquivo) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }
  res.writeHead(200, {
    'content-type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(arquivo).pipe(res);
}).listen(porta, () => console.log('preview em http://localhost:' + porta));
