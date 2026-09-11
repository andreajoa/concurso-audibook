const crypto = require('crypto');

function escapeHtml(value='') {
  return String(value).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}

function fromAddress() {
  return process.env.EMAIL_FROM || 'Apostilas Margareth Almeida <noreply@adhdautism.online>';
}

async function sendWithResend({ to, subject, html, text, scheduledAt, tags }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const body = { from:fromAddress(), to:[to], subject, html, text:text || undefined };
  if (scheduledAt) body.scheduled_at = scheduledAt;
  if (Array.isArray(tags) && tags.length) body.tags = tags;
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body:JSON.stringify(body)
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.message || `Resend failed: ${response.status}`);
  return data;
}

async function sendWithSmtp({ to, subject, html }) {
  const user=process.env.SMTP_USER,pass=process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) return null;
  const nodemailer=require('nodemailer');
  const transporter=nodemailer.createTransport({service:'gmail',auth:{user,pass}});
  return transporter.sendMail({from:fromAddress(),to,subject,html});
}

async function deliver(message) {
  const resend=await sendWithResend(message);
  if (resend) return {provider:'resend',id:resend.id||null};
  const smtp=await sendWithSmtp(message);
  if (smtp) return {provider:'smtp',id:smtp.messageId||null};
  throw new Error('No email provider configured.');
}

function shell({ eyebrow, title, body, ctaLabel, ctaUrl, footer='' }) {
  const cta=ctaUrl?`<p style="margin:28px 0"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#a64b2a;color:#fff;text-decoration:none;padding:15px 22px;border-radius:999px;font-weight:800">${escapeHtml(ctaLabel||'Continuar')}</a></p>`:'';
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#fff8f3;font-family:Arial,sans-serif;color:#18283d"><div style="max-width:680px;margin:0 auto;padding:26px 16px"><div style="background:#09274b;color:#fff;padding:30px;border-radius:22px 22px 0 0"><p style="margin:0 0 8px;color:#f3b69a;font-size:11px;font-weight:800;letter-spacing:.14em">${escapeHtml(eyebrow)}</p><h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:34px;line-height:1.08">${escapeHtml(title)}</h1></div><div style="background:#fff;padding:30px;border:1px solid rgba(9,39,75,.12);border-top:0;border-radius:0 0 22px 22px;font-size:15px;line-height:1.65">${body}${cta}${footer}<hr style="border:0;border-top:1px solid rgba(9,39,75,.12);margin:28px 0 20px"><p style="margin:0;color:#6d7785;font-size:12px">Sala de Estudos • Margareth Almeida<br>Material independente de preparação para concursos.</p></div></div></body></html>`;
}

function accessEmailHtml({ productName, accessUrl }) {
  const body=`<p>Seu pagamento de <strong>${escapeHtml(productName)}</strong> foi confirmado e sua área de estudo já está liberada.</p><p>Você pode ler o PDF na plataforma, baixar a apostila e ouvir ou baixar o audiobook por capítulos. Use esse material como parte de uma preparação direcionada: revise os contrastes, treine as questões e volte aos pontos em que ainda houver dúvida.</p><div style="padding:17px;border-radius:15px;background:#fff8f3;border-left:4px solid #a64b2a"><strong style="color:#09274b">Guarde este e-mail.</strong><p style="margin:6px 0 0;color:#697586">Ele contém seu caminho de volta ao material. Se perder o acesso, também é possível recuperá-lo usando o mesmo e-mail da compra.</p></div>`;
  return shell({eyebrow:'COMPRA APROVADA • SEU ESTUDO CONTINUA',title:'Seu material está liberado.',body,ctaLabel:'Abrir minha área de estudo',ctaUrl:accessUrl,footer:'<p style="color:#405047">Que esse material ajude você a chegar à prova com mais clareza, repertório e segurança no que estudou.<br><strong>Margareth Almeida</strong></p>'});
}

async function sendAccessEmail({to,productName,accessUrl}) {
  return deliver({to,subject:`Compra aprovada — seu acesso a ${productName}`,html:accessEmailHtml({productName,accessUrl}),tags:[{name:'type',value:'purchase'}]});
}

async function sendAbandonedCheckoutEmail({to,productName,returnUrl}) {
  const body=`<p>Você chegou até a etapa de pagamento de <strong>${escapeHtml(productName)}</strong>, mas a compra não foi concluída.</p><p>Se foi apenas uma interrupção, você pode retomar com calma. O material reúne PDF, questões e audiobook para que a revisão não dependa de um único formato.</p><p style="color:#697586">Se você decidiu não comprar, não precisa fazer nada.</p>`;
  return deliver({to,subject:'Seu checkout ficou pelo caminho — quer continuar?',html:shell({eyebrow:'SEU ESTUDO FICOU EM ABERTO',title:'Quer retomar de onde parou?',body,ctaLabel:'Voltar para a apostila',ctaUrl:returnUrl}),tags:[{name:'type',value:'checkout_recovery'}]});
}

async function sendPaymentFailedEmail({to,productName,returnUrl}) {
  const body=`<p>A tentativa de pagamento de <strong>${escapeHtml(productName)}</strong> não foi confirmada pela Stripe.</p><p>Isso pode acontecer por limite, validação do banco ou uma interrupção temporária. Nenhuma nova cobrança será feita por este e-mail. Se quiser, volte à página e tente novamente com o método disponível no checkout.</p>`;
  return deliver({to,subject:'O pagamento não foi concluído',html:shell({eyebrow:'PAGAMENTO NÃO CONFIRMADO',title:'Sua compra ainda não foi concluída.',body,ctaLabel:'Tentar novamente',ctaUrl:returnUrl}),tags:[{name:'type',value:'payment_failed'}]});
}

function unsubscribeToken(email) {
  const secret=process.env.UNSUBSCRIBE_SECRET;
  if(!secret) return '';
  return crypto.createHmac('sha256',secret).update(String(email).toLowerCase()).digest('hex');
}

function unsubscribeUrl(email, origin) {
  const token=unsubscribeToken(email);
  return token?`${origin.replace(/\/$/,'')}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`:'';
}

async function sendMarketingEmail({to,subject,title,bodyHtml,ctaLabel,ctaUrl,origin,scheduledAt,campaign='apostilas'}) {
  const unsub=unsubscribeUrl(to,origin);
  const footer=unsub?`<p style="margin-top:24px;color:#7b8490;font-size:11px">Você recebeu esta mensagem porque autorizou novidades sobre apostilas e preparação. <a href="${escapeHtml(unsub)}" style="color:#7b8490">Cancelar e-mails promocionais</a>.</p>`:'';
  return deliver({to,subject,html:shell({eyebrow:'SALA DE ESTUDOS • MARGARETH ALMEIDA',title,body:bodyHtml,ctaLabel,ctaUrl,footer}),scheduledAt,tags:[{name:'type',value:'marketing'},{name:'campaign',value:campaign}]});
}

module.exports={sendAccessEmail,sendAbandonedCheckoutEmail,sendPaymentFailedEmail,sendMarketingEmail,unsubscribeToken,unsubscribeUrl};
