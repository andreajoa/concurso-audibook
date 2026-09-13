/**
 * Publicação autônoma semanal.
 *
 * Fluxo: Vercel Cron → este endpoint → escolhe a pauta → pede o texto ao modelo
 * → valida → grava content/articles.json no GitHub → o push dispara build na
 * Vercel → scripts/build-seo.cjs gera a página estática, entra no sitemap, no
 * feed e no llms-full.txt → IndexNow avisa o Bing (que é o índice que a busca do
 * ChatGPT consulta).
 *
 * Por que passar pelo GitHub em vez de escrever um arquivo: função serverless
 * roda em sistema de arquivos efêmero e somente leitura no diretório do projeto.
 * O que ela escrevesse morreria no fim da invocação. Commitar no repositório é o
 * único caminho que resulta em HTML estático de verdade — que é também a melhor
 * opção de SEO, porque a página existe antes do rastreador chegar.
 *
 * Variáveis de ambiente necessárias:
 *   CRON_SECRET        já usado pelo cron de marketing
 *   ANTHROPIC_API_KEY  chave da API que escreve o texto
 *   GITHUB_TOKEN       token com permissão de escrita em conteúdo do repositório
 *   GITHUB_REPO        ex.: andreajoa/concurso-audibook
 *   EDITORIAL_MODEL    opcional, padrão claude-opus-4-6
 *   INDEXNOW_KEY       opcional; sem ela o aviso ao Bing é apenas pulado
 */

const backlog = require('../content/editorial-backlog.json');
const guides = require('../content/search-guides.json');
const cities = require('../content/local-seo.json');
const { catalog } = require('../lib/catalog');
const editorial = require('../lib/editorial');

const ORIGIN = 'https://www.concursotrilhaaprova.online';
const ARTICLES_PATH = 'content/articles.json';
const BACKLOG_PATH = 'content/editorial-backlog.json';

const products = Object.values(catalog).filter((p) => p.active !== false);

const allowedPaths = [
  '/', '/apostilas-para-concurso', '/perguntas-frequentes', '/sobre',
  '/contato', '/entrega-e-acesso', '/cancelamentos', '/materias',
  ...guides.map((g) => '/' + g.slug),
  ...cities.map((c) => '/' + c.slug),
  ...products.map((p) => '/apostilas/' + p.slug)
];

/* ------------------------------------------------------------------ GitHub */

function gh(path, init = {}) {
  const repo = process.env.GITHUB_REPO;
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'trilha-aprova-editorial',
      ...(init.headers || {})
    }
  });
}

// O arquivo no bundle é o do último build e pode estar atrasado em relação ao
// repositório. A fonte de verdade da fila publicada é sempre o GitHub.
async function readJson(path, fallback) {
  const res = await gh(path);
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`github_read_${res.status}`);
  const body = await res.json();
  return { data: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')), sha: body.sha };
}

async function writeJson(path, data, sha, message) {
  const res = await gh(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64'),
      ...(sha ? { sha } : {})
    })
  });
  if (!res.ok) throw new Error(`github_write_${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* ---------------------------------------------------------------- modelo */

async function writeArticle(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.EDITORIAL_MODEL || 'claude-opus-4-6',
      max_tokens: 8000,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`anthropic_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/* -------------------------------------------------------------- IndexNow */

// O Google encerrou o ping de sitemap em 2023; o IndexNow é o que resta de
// notificação ativa, e vale mais do que parece: quem consome o índice do Bing é
// a busca do ChatGPT e a do Copilot.
async function pingIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return 'sem_chave';
  const host = new URL(ORIGIN).host;
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList: urls })
  });
  return res.status;
}

/* ------------------------------------------------------------------ worker */

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  for (const name of ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_REPO']) {
    if (!process.env[name]) return res.status(500).json({ error: 'missing_env', missing: name });
  }

  try {
    const { data: published, sha } = await readJson(ARTICLES_PATH, []);
    const { data: queue } = await readJson(BACKLOG_PATH, backlog);

    const topic = editorial.pickTopic(queue, published);
    if (!topic) {
      // Fila vazia é uma decisão editorial, não um erro: é melhor o site parar de
      // publicar do que passar a gerar pauta sozinho e repetir assunto.
      console.warn('editorial_cron: backlog esgotado');
      return res.status(200).json({ ok: true, published: false, reason: 'backlog_vazio' });
    }

    const context = { products, guides, cities, articles: published };
    const basePrompt = editorial.buildPrompt(topic, context);
    const today = new Date().toISOString().slice(0, 10);

    let record = null;
    const attempts = [];

    // Duas tentativas. A segunda recebe os problemas encontrados na primeira,
    // porque a falha mais comum é de forma (descrição longa demais) e não de
    // conteúdo. O que nunca acontece é publicar com problema pendente.
    for (let attempt = 1; attempt <= 2 && !record; attempt++) {
      const prompt = attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nA versão anterior foi REPROVADA por:\n- ${attempts.join('\n- ')}\nCorrija e devolva o JSON completo novamente.`;

      let article;
      try {
        article = editorial.parseArticle(await writeArticle(prompt));
      } catch (e) {
        attempts.push(`resposta ilegível: ${e.message}`);
        continue;
      }
      const check = editorial.validateArticle(article, { published, allowedPaths });
      if (check.ok) record = editorial.toRecord(article, topic, check.slug, today);
      else attempts.push(...check.problems);
    }

    if (!record) {
      console.error('editorial_cron: reprovado', topic.id, attempts);
      return res.status(200).json({ ok: true, published: false, topic: topic.id, problems: attempts });
    }

    const next = [...published, record];
    await writeJson(ARTICLES_PATH, next, sha, `conteúdo: publica "${record.title}"`);

    const url = `${ORIGIN}/materias/${record.slug}`;
    const ping = await pingIndexNow([url, `${ORIGIN}/materias`, `${ORIGIN}/sitemap.xml`]).catch((e) => String(e.message));

    return res.status(200).json({ ok: true, published: true, topic: topic.id, slug: record.slug, url, indexnow: ping, total: next.length });
  } catch (error) {
    console.error('editorial_cron', error);
    return res.status(500).json({ error: 'worker_failed', detail: String(error.message).slice(0, 200) });
  }
};
