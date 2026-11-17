/**
 * Recuperação de checkout POR APOSTILA (17/11/2026).
 *
 * Antes: 30 e-mails genéricos sobre "autores IBAM" (produto já fora de venda) iam para quem abandonasse QUALQUER
 * apostila, com preço fixo de R$ 24,99. Agora cada mensagem é montada com o catálogo do produto abandonado
 * (concurso, banca, preço, conteúdo, capa) e com a data real da prova como urgência — nunca preço "de/por".
 *
 * Cadência (prática de mercado: Klaviyo/Rejoiner/Omnisend — 1 h, 24 h, 72 h; Baymard ~70% de abandono):
 *   r1  ao expirar o checkout (1 h)      webhook checkout.session.expired
 *   pix logo que o Pix é gerado e não pago  webhook checkout.session.completed com payment_status=unpaid
 *   r2  dia 1   o que vem no material (objeções)
 *   r3  dia 3   contagem regressiva + plano de estudo até a prova
 *   r4  dia 6   último lembrete da sequência
 *   p10 / p3    10 e 3 dias antes da prova (só se abandonou há 7–75 dias e a prova ainda não passou)
 * Para na hora se a pessoa comprou a mesma apostila, cancelou e-mails ou se a apostila saiu de venda.
 */
const DAY = 86400000;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function brl(cents) {
  return 'R$ ' + (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
}

/** Dias inteiros (fuso de São Paulo) até a prova, ou null se a data não está no catálogo. */
function daysToExam(product, now = new Date()) {
  const date = product?.exam?.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / DAY);
}

/** Qual passo da sequência vence hoje para um checkout abandonado (rodado 1x por dia pelo cron). */
function dueStep(product, sessionCreatedSec, now = new Date()) {
  const ageDays = Math.floor((now.getTime() - Number(sessionCreatedSec) * 1000) / DAY);
  const left = daysToExam(product, now);
  if (left !== null && left < 0) return null;                 // prova já passou: material não serve mais
  if (ageDays === 1) return 'r2';
  if (ageDays === 3) return 'r3';
  if (ageDays === 6) return 'r4';
  if (ageDays >= 7 && ageDays <= 75 && left === 10) return 'p10';
  if (ageDays >= 7 && ageDays <= 75 && left === 3) return 'p3';
  return null;
}

function examLine(product, now) {
  const left = daysToExam(product, now);
  if (left === null) return '';
  const when = new Date(product.exam.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', timeZone: 'UTC' });
  const prevista = product.exam.confirmed ? '' : ' (data prevista no edital)';
  if (left === 0) return `A prova é hoje${prevista}.`;
  return `Faltam <strong>${left} dia${left === 1 ? '' : 's'}</strong> para a prova, em ${escapeHtml(when)}${prevista}.`;
}

/** Bloco do produto: capa, nome, banca, preço e o que vem — o "carrinho" dentro do e-mail. */
function productCard(product, origin, limit = 3) {
  const cover = product.storefront?.cover3d ? `${origin}${product.storefront.cover3d}` : '';
  const points = (product.proofPoints || []).slice(0, limit)
    .map(p => `<tr><td valign="top" style="padding:0 8px 8px 0;color:#2f8f5b;font-weight:800">✓</td><td style="padding:0 0 8px;color:#33445a;font-size:14px;line-height:1.5">${escapeHtml(p)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;border:1px solid #eadfcb;border-radius:16px;background:#fffdf8"><tr>
${cover ? `<td width="150" valign="top" style="padding:16px 0 16px 16px"><img src="${escapeHtml(cover)}" width="134" alt="${escapeHtml(product.shortName || product.name)}" style="display:block;width:134px;height:auto;border:0"></td>` : ''}
<td valign="top" style="padding:16px">
<p style="margin:0 0 4px;color:#a07a2c;font-size:11px;font-weight:800;letter-spacing:.12em">${escapeHtml((product.storefront?.shortTag || product.examBoard || '').toUpperCase())}</p>
<p style="margin:0 0 10px;color:#08284f;font-family:Georgia,serif;font-size:19px;line-height:1.25">${escapeHtml(product.shortName || product.name)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">${points}</table>
<p style="margin:8px 0 0;color:#08284f;font-size:22px;font-weight:800">${brl(product.priceCents)} <span style="font-size:12px;font-weight:400;color:#6d7785">pagamento único · Pix ou cartão</span></p>
</td></tr></table>`;
}

/** Assunto, título e corpo de cada passo. `ctx`: { origin, now, ctaUrl, pix?: { code, url, expiresAt } } */
function recoveryContent(step, product, ctx) {
  const name = product.shortName || product.name;
  const exam = examLine(product, ctx.now);
  const card = productCard(product, ctx.origin, step === 'r2' ? 8 : 3);
  const pixHint = '<p style="margin:14px 0 0;color:#33445a">Pagando com <strong>Pix</strong>, o acesso ao PDF e ao audiobook é liberado em segundos, no seu e-mail.</p>';
  const left = daysToExam(product, ctx.now);
  switch (step) {
    case 'r1': return {
      subject: `Sua apostila ${name} ficou guardada`, eyebrow: 'SEU PEDIDO FICOU ABERTO', title: 'Você parou bem perto da aprovação.',
      body: `<p>Você chegou ao pagamento da apostila <strong>${escapeHtml(name)}</strong> e a compra não foi concluída. Deixamos tudo pronto para você continuar de onde parou.</p>${card}${exam ? `<p style="margin:16px 0 0">${exam}</p>` : ''}${pixHint}`,
      cta: 'Concluir minha compra' };
    case 'pix': return {
      subject: `Seu Pix da apostila ${name} está pronto`, eyebrow: 'PIX GERADO', title: 'Falta só pagar o Pix.',
      body: `<p>O Pix da apostila <strong>${escapeHtml(name)}</strong> foi gerado. Assim que o pagamento cair, o acesso chega neste e-mail automaticamente.</p>
${ctx.pix?.code ? `<p style="margin:16px 0 6px;font-weight:800;color:#08284f">Pix copia e cola</p><p style="margin:0;padding:12px;border:1px dashed #caa65a;border-radius:12px;background:#fffdf8;font-family:Menlo,Consolas,monospace;font-size:12px;word-break:break-all;color:#18283d">${escapeHtml(ctx.pix.code)}</p>` : ''}
<p style="margin:14px 0 0;color:#6d7785;font-size:13px">O código vale por 1 hora. Se expirar, é só gerar outro pelo botão abaixo.</p>${card}`,
      cta: ctx.pix?.url ? 'Ver o QR Code do Pix' : 'Gerar um novo Pix' };
    case 'r2': return {
      subject: `O que vem na apostila ${name} (antes de você decidir)`, eyebrow: 'O QUE VOCÊ RECEBE', title: 'Tudo o que vem no material, sem letra miúda.',
      body: `<p>Ontem você olhou a apostila <strong>${escapeHtml(name)}</strong>. Para decidir com calma, aqui está exatamente o que vem nela, feita a partir do edital${product.examBoard ? ` da banca <strong>${escapeHtml(product.examBoard)}</strong>` : ''}:</p>${card}
<p style="margin:16px 0 0">É pagamento único, sem mensalidade. Você lê na plataforma, baixa o PDF e ouve o audiobook por capítulos, no celular ou no computador.</p>${exam ? `<p style="margin:12px 0 0">${exam}</p>` : ''}`,
      cta: 'Quero a apostila completa' };
    case 'r3': return {
      subject: left !== null ? `Faltam ${left} dias para a prova — ${name}` : `Um plano simples para estudar para ${name}`,
      eyebrow: 'CONTAGEM REGRESSIVA', title: left !== null ? `${left} dias. Dá para chegar preparado.` : 'Estudo organizado vence estudo longo.',
      body: `<p>${exam || 'A prova está chegando.'} Quem chega bem não é quem estudou mais horas, e sim quem estudou o que cai, no formato da banca.</p>
<p style="margin:14px 0 6px;font-weight:800;color:#08284f">Um plano possível com o material:</p>
<ol style="margin:0 0 6px 18px;padding:0;color:#33445a"><li>Primeira metade do tempo: teoria por disciplina, ouvindo o audiobook nos deslocamentos.</li><li>Segunda metade: questões comentadas, anotando cada erro.</li><li>Últimos dias: simulados no formato da banca e revisão só dos erros.</li></ol>${card}`,
      cta: 'Começar meu plano hoje' };
    case 'r4': return {
      subject: `Último lembrete sobre a apostila ${name}`, eyebrow: 'ÚLTIMO LEMBRETE', title: 'Não vou insistir depois deste.',
      body: `<p>Este é o último e-mail desta sequência sobre a apostila <strong>${escapeHtml(name)}</strong>. Se ainda faz sentido para a sua preparação, o material continua disponível pelo mesmo preço.</p>${card}${exam ? `<p style="margin:16px 0 0">${exam}</p>` : ''}${pixHint}`,
      cta: 'Garantir minha apostila' };
    case 'p10': return {
      subject: `10 dias para a prova: ${name}`, eyebrow: 'RETA FINAL', title: 'Dez dias ainda mudam uma prova.',
      body: `<p>${exam} Dez dias bem usados são suficientes para revisar o essencial e treinar no formato da banca.</p>${card}`,
      cta: 'Usar meus 10 dias com o material' };
    case 'p3': return {
      subject: `3 dias para a prova de ${name}`, eyebrow: 'VÉSPERA', title: 'Três dias: revise o que mais cai.',
      body: `<p>${exam} Na véspera, o melhor estudo é revisão dirigida e simulado, não conteúdo novo. O material tem isso pronto, com acesso imediato no Pix.</p>${card}`,
      cta: 'Revisar com a apostila agora' };
    default: return null;
  }
}

module.exports = { dueStep, daysToExam, recoveryContent, productCard, brl };
