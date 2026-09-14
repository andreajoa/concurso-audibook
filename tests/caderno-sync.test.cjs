/**
 * A sincronização do caderno vista de fora: o que a tela recebe.
 *
 * O banco é substituído por uma função de mentira porque o que está sendo
 * testado não é o Postgres — é a decisão de quem sincroniza: quando devolver
 * o caderno fundido, quando dizer que a assinatura acabou e, principalmente,
 * o que fazer quando o outro aparelho gravou no meio do caminho.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const crmPath = require.resolve('../lib/crm-rpc');
require(crmPath);
const crm = require.cache[crmPath].exports;
const rpcReal = crm.rpc;

let chamadas = [];
let responder = () => ({ ok: false });
crm.rpc = async (nome, body) => { chamadas.push([nome, body]); return responder(nome, body); };

const sincronizar = require('../lib/caderno-sync');

test.after(() => { crm.rpc = rpcReal; });

function resposta() {
  const r = {
    code: 0, body: null, headers: {},
    setHeader(k, v) { r.headers[k] = v; },
    status(c) { r.code = c; return r; },
    json(b) { r.body = b; return r; }
  };
  return r;
}

const chaveValida = 'a'.repeat(48);
const erro = (over) => Object.assign({
  id: 1, materia: 'Português', topico: 'Crase', motivo: 'nao-sabia', anotacao: '',
  criadoEm: '2026-03-01', degrau: 0, proxima: '2026-03-02',
  erros: 1, acertosSeguidos: 0, dominado: false
}, over);

async function chamar(body, fake) {
  chamadas = [];
  responder = fake || (() => ({ ok: false }));
  const res = resposta();
  await sincronizar({ method: 'POST', body }, res);
  return res;
}

test('chave fora do formato nem chega ao banco', async () => {
  const res = await chamar({ chave: 'nao-sou-uma-chave', estado: { versao: 1, itens: [] } });
  assert.equal(res.code, 400);
  assert.equal(chamadas.length, 0, 'uma chave inválida não pode custar uma consulta');
  assert.match(res.body.erro, /chave/i);
});

test('caderno sem lista de itens é recusado antes de qualquer gravação', async () => {
  const res = await chamar({ chave: chaveValida, estado: { versao: 1 } });
  assert.equal(res.code, 400);
  assert.equal(chamadas.length, 0);
});

test('caderno maior que o teto responde 413 e não apaga nada', async () => {
  const itens = Array.from({ length: 5001 }, (_, n) => erro({ id: n + 1, criadoEm: '2026-03-01' }));
  const res = await chamar({ chave: chaveValida, estado: { versao: 1, itens } });
  assert.equal(res.code, 413);
  assert.equal(chamadas.length, 0);
});

test('assinatura inativa devolve 402 e o texto que não assusta', async () => {
  const res = await chamar({ chave: chaveValida, estado: { versao: 1, itens: [] } },
    (nome) => (nome === 'caderno_puxar' ? { ok: false, motivo: 'inativa' } : null));
  assert.equal(res.code, 402);
  assert.match(res.body.erro, /continua guardado/i);
});

test('chave que não existe devolve 401', async () => {
  const res = await chamar({ chave: chaveValida, estado: { versao: 1, itens: [] } },
    (nome) => (nome === 'caderno_puxar' ? { ok: false, motivo: 'chave' } : null));
  assert.equal(res.code, 401);
});

test('o que volta é a fusão dos dois lados, não o que foi enviado', async () => {
  const remoto = { versao: 1, itens: [erro({ materia: 'Direito', topico: 'Atos', criadoEm: '2026-02-01' })] };
  const local = { versao: 1, itens: [erro({ materia: 'Português', topico: 'Crase', criadoEm: '2026-03-01' })] };
  const res = await chamar({ chave: chaveValida, estado: local }, (nome) => {
    if (nome === 'caderno_puxar') return { ok: true, estado: remoto, revisao: 7, vale_ate: '2026-10-01T00:00:00Z' };
    return { ok: true };
  });
  assert.equal(res.code, 200);
  assert.equal(res.body.estado.itens.length, 2, 'nenhum dos dois aparelhos pode perder o que anotou');
  assert.equal(res.body.valeAte, '2026-10-01T00:00:00Z');
  const gravou = chamadas.find(c => c[0] === 'caderno_gravar');
  assert.equal(gravou[1].payload.revisao, 7, 'grava com a revisão que leu, senão o conflito não é detectado');
});

test('conflito com o outro aparelho refaz a fusão em vez de sobrescrever', async () => {
  let vez = 0;
  const local = { versao: 1, itens: [erro({ criadoEm: '2026-03-01' })] };
  const res = await chamar({ chave: chaveValida, estado: local }, (nome) => {
    if (nome === 'caderno_puxar') {
      vez++;
      return vez === 1
        ? { ok: true, estado: { versao: 1, itens: [] }, revisao: 1 }
        : { ok: true, estado: { versao: 1, itens: [erro({ materia: 'Direito', criadoEm: '2026-02-01' })] }, revisao: 2 };
    }
    return vez === 1 ? { ok: false, motivo: 'conflito' } : { ok: true };
  });
  assert.equal(res.code, 200);
  assert.equal(res.body.estado.itens.length, 2, 'o item que chegou durante o conflito precisa sobreviver');
  assert.equal(chamadas.filter(c => c[0] === 'caderno_puxar').length, 2);
});

test('conflito que insiste devolve 409 em vez de tentar para sempre', async () => {
  const res = await chamar({ chave: chaveValida, estado: { versao: 1, itens: [] } }, (nome) => (
    nome === 'caderno_puxar'
      ? { ok: true, estado: { versao: 1, itens: [] }, revisao: 1 }
      : { ok: false, motivo: 'conflito' }
  ));
  assert.equal(res.code, 409);
  assert.equal(chamadas.filter(c => c[0] === 'caderno_puxar').length, 2, 'uma retentativa, não um laço');
});

test('banco fora do ar não perde o caderno: 503 e um recado honesto', async () => {
  const res = await chamar({ chave: chaveValida, estado: { versao: 1, itens: [] } }, () => { throw new Error('sem rede'); });
  assert.equal(res.code, 503);
  assert.match(res.body.erro, /salvo neste aparelho/i);
});

test('a fusão usada aqui é a mesma que o navegador usa', () => {
  const doNavegador = require(path.join(__dirname, '..', 'public', 'ferramentas.js')).fundirCadernos;
  const doServidor = require('../lib/caderno-sync');
  assert.equal(typeof doNavegador, 'function');
  assert.equal(typeof doServidor, 'function');
  const fonte = require('node:fs').readFileSync(path.join(__dirname, '..', 'lib', 'caderno-sync.js'), 'utf8');
  assert.match(fonte, /require\('\.\.\/public\/ferramentas\.js'\)/,
    'duas implementações da regra de fusão acabam discordando sobre o que revisar');
});
