/**
 * Confere a base de concursos contra a realidade.
 *
 * O site publica prazo de inscrição e data de prova. Esses dados envelhecem
 * sozinhos: o órgão prorroga a inscrição, a banca troca a data, a página da
 * fonte sai do ar. Nada disso avisa. Quem descobre é o candidato, no dia em
 * que perde a inscrição.
 *
 * Este script é o aviso. Ele não corrige nada e não escreve em disco de
 * propósito: dado de concurso é conferido por gente, lendo a página oficial.
 * O que ele faz é dizer, com precisão, quais entradas precisam desse olhar.
 *
 *   node scripts/check-concursos.mjs           # confere tudo, inclusive rede
 *   node scripts/check-concursos.mjs --offline # só o que dá para ver sem rede
 *
 * Sai com código 1 quando existe algo que exige ação humana, para o cron do
 * item 15 poder falhar alto em vez de falhar em silêncio.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cn = require('../lib/concursos.js');
const dataset = require('../content/concursos.json');

const HOJE = process.env.SITE_UPDATED || new Date().toISOString().slice(0, 10);
const OFFLINE = process.argv.includes('--offline');

// Quinze dias é o limite em que "conferido em" ainda significa alguma coisa
// para quem está decidindo se vai se inscrever esta semana.
const IDADE_MAXIMA = 15;
const TIMEOUT_MS = 12000;

const alertas = [];
const avisos = [];
const ok = [];

const alerta = (id, texto) => alertas.push({ id, texto });
const aviso = (id, texto) => avisos.push({ id, texto });

/* ------------------------------------------------ conferências sem rede */

for (const bruto of dataset) {
  const problemas = cn.problems(bruto);
  if (problemas.length) {
    for (const p of problemas) alerta(bruto.id || '(sem id)', p);
    continue;
  }

  const c = cn.normalize(bruto, HOJE);
  const idade = cn.daysBetween(c.capturedAt, HOJE);

  // O status declarado no arquivo discorda do status que o prazo impõe. Isso
  // não quebra o site — normalize() rebaixa sozinho — mas significa que o
  // arquivo está contando uma história velha e alguém precisa reler a fonte.
  if (c.status !== bruto.status) {
    alerta(c.id, `o arquivo diz "${bruto.status}" mas o prazo já fez virar "${c.status}" — reler ${c.sourceUrl}`);
  }

  if (idade !== null && idade > IDADE_MAXIMA) {
    const critico = c.status === 'inscricoes_abertas' || c.status === 'previsto';
    const texto = `conferido há ${idade} dias (${cn.brDate(c.capturedAt)}) e a página mostra essa data`;
    if (critico) alerta(c.id, texto + ' — certame ainda em movimento');
    else aviso(c.id, texto);
  }

  // Inscrição aberta sem data de encerramento é a combinação que mais machuca:
  // a pessoa lê "abertas" e supõe que há tempo.
  if (c.status === 'inscricoes_abertas' && !c.inscricaoFim) {
    alerta(c.id, 'marcado como inscrições abertas sem data de encerramento');
  }

  // Prova marcada como confirmada para uma data que já passou: ou saiu
  // resultado, ou a data mudou. Os dois casos pedem releitura.
  if (c.dataProva && cn.daysBetween(HOJE, c.dataProva) < 0 && bruto.status !== 'encerrado') {
    aviso(c.id, `data de prova ${cn.brDate(c.dataProva)} já passou e o arquivo ainda não a encerrou`);
  }
}

/* ------------------------------------------------------- conferência de rede */

async function confereUrl(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // HEAD é recusado por parte das bancas; GET com Range pede só o começo.
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'TrilhaAprova-LinkCheck/1.0 (+https://www.concursotrilhaaprova.online/contato)' }
    });
    return { status: r.status, final: r.url };
  } catch (e) {
    return { status: 0, erro: e.name === 'AbortError' ? `sem resposta em ${TIMEOUT_MS / 1000}s` : e.message };
  } finally {
    clearTimeout(t);
  }
}

if (!OFFLINE) {
  // Uma URL de fonte costuma servir vários certames da mesma cidade. Conferir
  // uma vez só evita bater na banca mais do que o necessário.
  const porUrl = new Map();
  for (const c of dataset) {
    for (const url of [c.sourceUrl, c.editalUrl].filter(Boolean)) {
      if (!porUrl.has(url)) porUrl.set(url, []);
      porUrl.get(url).push(c.id);
    }
  }

  const urls = [...porUrl.keys()];
  process.stderr.write(`Conferindo ${urls.length} endereço(s) de fonte...\n`);

  // Em série, com pausa: são páginas de prefeitura e de banca pequena.
  for (const url of urls) {
    const r = await confereUrl(url);
    const ids = porUrl.get(url).join(', ');
    if (r.status === 200) ok.push(url);
    else if (r.status === 0) alerta(ids, `fonte não respondeu: ${url} (${r.erro})`);
    else if (r.status === 404 || r.status === 410) alerta(ids, `fonte saiu do ar (HTTP ${r.status}): ${url}`);
    else aviso(ids, `fonte respondeu HTTP ${r.status}: ${url}`);
    await new Promise(res => setTimeout(res, 400));
  }
}

/* ------------------------------------------------------------------ saída */

const linha = (rotulo, itens) => itens.map(i => `${rotulo}  ${i.id}\n        ${i.texto}`).join('\n');

console.log('');
console.log(`Base: ${dataset.length} certames · data de referência ${cn.brDate(HOJE)}${OFFLINE ? ' · sem rede' : ''}`);
if (ok.length) console.log(`Fontes no ar: ${ok.length}`);
console.log('');

if (avisos.length) {
  console.log('AVISO — vale olhar quando der:');
  console.log(linha('  •', avisos));
  console.log('');
}

if (alertas.length) {
  console.log('AÇÃO — o site está publicando isso agora:');
  console.log(linha('  !', alertas));
  console.log('');
  console.log(`${alertas.length} item(ns) exigem releitura da fonte oficial antes do próximo build.`);
  process.exit(1);
}

console.log('Nada a corrigir: todo certame publicado bate com o que o arquivo declara.');

// O relatório em JSON existe para o cron guardar histórico sem reparsear texto.
if (process.env.CONCURSOS_REPORT) {
  fs.writeFileSync(process.env.CONCURSOS_REPORT, JSON.stringify({
    hoje: HOJE, total: dataset.length, fontesNoAr: ok.length, alertas, avisos
  }, null, 2) + '\n');
}
