const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('api/access-page.js', 'utf8');

test('link direto da apostila oferece login seguro do proprietário quando nao ha sessao', () => {
  assert.match(source, /if \(!sessionId\) return responderLoginDono\(res, slugSolicitado\)/);
  assert.match(source, /<form method="post" action="\/api\/access-page"/);
  assert.match(source, /name="admin" type="password"/);
  assert.match(source, /name="slug" value=/);
});

test('senha do proprietario continua validada pelo dashboard e cria cookie HttpOnly', () => {
  assert.match(source, /crm_dashboard_activity/);
  assert.match(source, /HttpOnly; Secure; SameSite=Strict; Path=\/api\/access-page/);
  assert.match(source, /Max-Age=\$\{DURACAO_PASSE_SEGUNDOS\}/);
});

test('conteudo pago nao fica publico apenas por conhecer o slug', () => {
  assert.match(source, /const dono = passeValido\(lerCookie\(req, PASSE\)\)/);
  assert.match(source, /const purchase = await verifyPurchase\(sessionId\)/);
  assert.doesNotMatch(source, /if \(slugSolicitado\)\s*product = getProduct/);
});

test('apos login o navegador volta ao mesmo slug sem senha no endereco', () => {
  assert.match(source, /res\.setHeader\('Location', '\/api\/access-page\?slug=' \+ encodeURIComponent\(slug\)\)/);
  assert.match(source, /statusCode = 303/);
});
