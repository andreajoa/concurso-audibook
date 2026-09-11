async function sendWithResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  if (!response.ok) throw new Error(`Resend failed: ${response.status}`);
  return true;
}

async function sendWithSmtp({ to, subject, html }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) return false;
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `Sala de Estudos <${user}>`,
    to,
    subject,
    html
  });
  return true;
}

function accessEmailHtml({ productName, accessUrl }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f0e8;font-family:Arial,sans-serif;color:#10243d"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:20px;padding:30px;border:1px solid #e7ded2"><div style="font-size:12px;letter-spacing:.14em;color:#a84b2b;font-weight:700">SALA DE ESTUDOS • MARGARETH ALMEIDA</div><h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.1">Seu material já está liberado.</h1><p style="line-height:1.6">O pagamento de <strong>${escapeHtml(productName)}</strong> foi confirmado. Use o botão abaixo para abrir sua área de estudo individual.</p><p style="margin:26px 0"><a href="${escapeHtml(accessUrl)}" style="display:inline-block;background:#0c2748;color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700">Acessar meu material</a></p><p style="font-size:13px;line-height:1.6;color:#66717e">Guarde este e-mail. Se trocar de dispositivo ou perder o acesso, você pode solicitar um novo link usando o mesmo e-mail utilizado no pagamento.</p></div></div></body></html>`;
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}

async function sendAccessEmail({ to, productName, accessUrl }) {
  if (!to) throw new Error('Buyer email is missing.');
  const message = {
    to,
    subject: `Seu acesso: ${productName}`,
    html: accessEmailHtml({ productName, accessUrl })
  };
  if (await sendWithResend(message)) return 'resend';
  if (await sendWithSmtp(message)) return 'smtp';
  throw new Error('No transactional email provider is configured.');
}

module.exports = { sendAccessEmail };
