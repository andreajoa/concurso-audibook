const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const audit = fs.readFileSync('scripts/audit-study-media.py', 'utf8');

test('auditoria conhece os produtos Santos 2026 publicados', () => {
  assert.match(audit, /'secretario-de-unidade-escolar-ibam-santos-2026'\s*:\s*\{[\s\S]*?'pages'\s*:\s*84/);
  assert.match(audit, /'professor-adjunto-i-ibam-santos-2026'\s*:\s*\{[\s\S]*?'pages'\s*:\s*132/);
});

test('produto ativo sem expectativa explicita falha a auditoria', () => {
  assert.match(audit, /require\(source or expectation, f'\{slug\}: missing media audit expectations'\)/);
});
