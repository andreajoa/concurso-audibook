/**
 * Assinatura do caderno de erros.
 *
 * O site vende apostilas: uma prova, um material, um pagamento. Esta é a única
 * coisa que ele cobra por mês, e por um motivo que não é comercial: um caderno
 * de erros só vale se acompanhar a pessoa, e acompanhar exige guardar. Tudo o
 * que é calculado fica de graça no navegador, para sempre; o que se cobra é a
 * memória entre aparelhos.
 *
 * Fica fora de products/catalog.json de propósito. Aquele arquivo descreve
 * coisas com PDF, capa e audiobook, e metade do site assume isso — o gerador
 * de páginas, o assinador do R2, o painel. Uma assinatura sem arquivo nenhum
 * entrando lá quebraria todos eles para economizar um require.
 */

const crypto = require('crypto');
const { request, baseUrl } = require('./stripe');
const { rpc } = require('./crm-rpc');

const SITE_ID = 'concurso_audiobook';
const PROJECT_ID = 'concurso_audiobook';

const PLANO = {
  slug: 'caderno-de-erros',
  nome: 'Caderno de erros — assinatura mensal',
  descricao: 'Seu caderno de erros guardado e sincronizado entre celular e computador, com a fila de revisão calculada todo dia.',
  currency: 'brl',
  priceCents: 1990,
  intervalo: 'month',
  stripePriceEnv: 'STRIPE_PRICE_CADERNO_MENSAL'
};

const clean = (value, max = 160) => String(value || '').trim().slice(0, max);

/** 48 hex. Longa o bastante para não ser adivinhada, curta o bastante para caber num link. */
function novaChave() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Sessão de checkout recorrente.
 *
 * Não reaproveita createCheckout: lá todo parâmetro de metadados vai em
 * payment_intent_data, que o Stripe recusa em modo assinatura. Duas linhas
 * repetidas custam menos que um if espalhado por um arquivo que cuida da
 * venda das apostilas.
 */
async function criarAssinatura(req, options = {}) {
  const origin = baseUrl(req);
  const analytics = options.analytics || {};
  const params = {
    mode: 'subscription',
    locale: 'pt-BR',
    ui_mode: 'embedded',
    redirect_on_completion: 'always',
    return_url: `${origin}/caderno-ativado?session_id={CHECKOUT_SESSION_ID}`,
    'line_items[0][quantity]': 1,
    'metadata[site_id]': SITE_ID,
    'metadata[project_id]': PROJECT_ID,
    'metadata[product_slug]': PLANO.slug,
    'subscription_data[metadata][site_id]': SITE_ID,
    'subscription_data[metadata][project_id]': PROJECT_ID,
    'subscription_data[metadata][product_slug]': PLANO.slug
  };

  const email = clean(options.email, 240).toLowerCase();
  if (email) params.customer_email = email;

  for (const [name, value] of Object.entries({
    visitor_id: analytics.visitorId, session_id: analytics.sessionId,
    source: analytics.source, medium: analytics.medium, campaign: analytics.campaign
  })) {
    const v = clean(value, name === 'campaign' ? 240 : 120);
    if (!v) continue;
    params[`metadata[analytics_${name}]`] = v;
    params[`subscription_data[metadata][analytics_${name}]`] = v;
  }

  const precoFixo = process.env[PLANO.stripePriceEnv];
  if (precoFixo) {
    params['line_items[0][price]'] = precoFixo;
  } else {
    params['line_items[0][price_data][currency]'] = PLANO.currency;
    params['line_items[0][price_data][unit_amount]'] = PLANO.priceCents;
    params['line_items[0][price_data][recurring][interval]'] = PLANO.intervalo;
    params['line_items[0][price_data][product_data][name]'] = PLANO.nome;
  }

  return request('/checkout/sessions', { method: 'POST', params });
}

/** Um evento do Stripe é desta assinatura? O webhook recebe eventos de tudo. */
function ehDoPlano(metadata = {}) {
  return metadata.site_id === SITE_ID
    && metadata.project_id === PROJECT_ID
    && metadata.product_slug === PLANO.slug;
}

/**
 * Traduz o status do Stripe para o que o banco precisa saber: liberar ou não.
 *
 * 'canceling' não existe no Stripe — é a leitura de uma assinatura que foi
 * cancelada mas ainda está paga até o fim do período. Quem cancelou hoje não
 * pode perder o caderno hoje: pagou o mês.
 */
function statusDoStripe(sub) {
  if (!sub) return 'pendente';
  if (sub.status === 'active' || sub.status === 'trialing') {
    return sub.cancel_at_period_end ? 'cancelando' : 'ativa';
  }
  if (sub.status === 'past_due' || sub.status === 'unpaid') return 'atrasada';
  return 'encerrada';
}

const paraIso = (segundos) => (segundos ? new Date(Number(segundos) * 1000).toISOString() : null);

/** Cria ou reativa o assinante e devolve a chave de acesso dele. */
async function registrarAssinante({ email, customer, subscription, status, valeAte }) {
  const resposta = await rpc('caderno_assinatura_registrar', {
    payload: {
      email: clean(email, 240).toLowerCase(),
      chave: novaChave(),
      stripe_customer: clean(customer, 80),
      stripe_subscription: clean(subscription, 80),
      status: status || 'ativa',
      vale_ate: valeAte || null
    }
  });
  return resposta && resposta.ok ? resposta : null;
}

/**
 * A chave a partir do session_id do checkout, para a página de retorno.
 *
 * O e-mail com a chave sai do webhook, e webhook é assíncrono: quem acabou de
 * pagar está olhando a tela agora, não a caixa de entrada. Esta função repete
 * o mesmo registro — a RPC nunca gira a chave de quem já tem uma — para que a
 * primeira pessoa a chegar, tela ou e-mail, receba o mesmo valor.
 *
 * Devolve null em vez de erro quando a sessão não é do plano ou ainda não foi
 * paga: a página de retorno consulta em laço enquanto o Stripe confirma.
 */
async function chaveDaSessao(sessionId) {
  if (!sessionId || !String(sessionId).startsWith('cs_')) return null;
  const session = await request(`/checkout/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
  if (!ehDoPlano(session.metadata || {})) return null;
  if (session.payment_status !== 'paid' && session.status !== 'complete') return null;
  const email = session.customer_details?.email || session.customer_email || '';
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!email || !subId) return null;
  const sub = await request(`/subscriptions/${encodeURIComponent(subId)}`, { method: 'GET' }).catch(() => null);
  const registro = await registrarAssinante({
    email,
    customer: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    subscription: subId,
    status: statusDoStripe(sub),
    valeAte: paraIso(sub?.current_period_end)
  });
  return registro?.chave ? { chave: registro.chave, email, status: registro.status || null } : null;
}

/** Renovação, cancelamento e falha de cobrança. Nunca apaga o caderno. */
async function atualizarStatus(sub) {
  return rpc('caderno_assinatura_status', {
    payload: {
      stripe_subscription: clean(sub && sub.id, 80),
      status: statusDoStripe(sub),
      vale_ate: paraIso(sub && (sub.current_period_end || sub.cancel_at))
    }
  });
}

module.exports = {
  PLANO, SITE_ID, PROJECT_ID,
  novaChave, criarAssinatura, ehDoPlano, statusDoStripe, paraIso,
  registrarAssinante, atualizarStatus, chaveDaSessao
};
