const crypto = require('crypto');
const { baseUrl, retrieveCheckoutSession, updateSessionMetadata, isPaidAndNotRefunded, sessionEmail, sessionProduct, request } = require('../lib/stripe');
const { getProduct } = require('../lib/catalog');
const { sendAccessEmail, sendAbandonedCheckoutEmail, sendPaymentFailedEmail } = require('../lib/email');
const { rpc } = require('../lib/crm-rpc');

const SITE_ID = 'concurso_audiobook';
const PROJECT_ID = 'concurso_audiobook';

async function rawBody(req) {
  const chunks=[];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts=String(header).split(',').map(x=>x.trim());
  const timestamp=parts.find(x=>x.startsWith('t='))?.slice(2);
  const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300) return false;
  const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex');
  return signatures.some(sig=>{try{const a=Buffer.from(sig,'hex'),b=Buffer.from(expected,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}});
}

function belongs(metadata={}) {
  return metadata.site_id===SITE_ID && metadata.project_id===PROJECT_ID;
}

function analyticsPayload(metadata={}, eventName, extra={}) {
  const visitor=metadata.analytics_visitor_id||'';
  const session=metadata.analytics_session_id||'';
  if (visitor.length<8 || session.length<8) return null;
  return {
    event_id:`stripe:${extra.eventId||crypto.randomUUID()}`,
    event_name:eventName,
    visitor_id:visitor,
    session_id:session,
    path:extra.path||'/obrigado.html',
    product_slug:metadata.product_slug||'',
    product_name:extra.productName||'',
    value_cents:Number(extra.valueCents||0),
    stripe_session_id:extra.stripeSessionId||'',
    source:metadata.analytics_source||'',
    medium:metadata.analytics_medium||'',
    campaign:metadata.analytics_campaign||''
  };
}

async function sessionForPaymentIntent(paymentIntentId) {
  if (!paymentIntentId) return null;
  const list=await request('/checkout/sessions',{method:'GET',params:{payment_intent:paymentIntentId,limit:1}});
  return Array.isArray(list.data)&&list.data.length?list.data[0]:null;
}

module.exports = async (req,res) => {
  if (req.method!=='POST') return res.status(405).end('Method not allowed');
  try {
    const payload=await rawBody(req);
    if (!verifyStripeSignature(payload,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).end('Invalid signature');
    const event=JSON.parse(payload.toString('utf8'));

    if (event.type==='checkout.session.completed' || event.type==='checkout.session.async_payment_succeeded') {
      const eventSession=event.data?.object;
      if (!eventSession?.id || !belongs(eventSession.metadata||{})) return res.status(200).json({received:true,ignored:true});
      const session=await retrieveCheckoutSession(eventSession.id);
      if (!isPaidAndNotRefunded(session)) return res.status(200).json({received:true});
      const slug=sessionProduct(session),product=getProduct(slug),email=sessionEmail(session);
      if (!product || !email) return res.status(200).json({received:true});
      await rpc('crm_order_paid',{p_session:session.id,p_amount:Number(session.amount_total||product.priceCents)}).catch(error=>console.error('crm_paid',error));
      const analytics=analyticsPayload(session.metadata,'purchase',{eventId:event.id,productName:product.name,valueCents:session.amount_total,stripeSessionId:session.id});
      if (analytics) await rpc('crm_track_event',{payload:analytics}).catch(()=>null);
      if (!session.metadata?.access_email_sent) {
        const accessUrl=`${baseUrl(req)}/acesso?session_id=${encodeURIComponent(session.id)}`;
        await sendAccessEmail({to:email,productName:product.name,accessUrl});
        await updateSessionMetadata(session.id,{access_email_sent:event.id});
      }
      return res.status(200).json({received:true,paid:true});
    }

    if (event.type==='checkout.session.expired') {
      const session=event.data?.object;
      if (!session?.id || !belongs(session.metadata||{})) return res.status(200).json({received:true,ignored:true});
      await rpc('crm_order_expired',{p_session:session.id}).catch(()=>null);
      await rpc('crm_lead_abandoned',{p_session:session.id}).catch(()=>null);
      if (session.metadata?.marketing_consent==='true') {
        const product=getProduct(session.metadata.product_slug),email=session.customer_details?.email||session.customer_email;
        if (product&&email) await sendAbandonedCheckoutEmail({to:email,productName:product.name,returnUrl:`${baseUrl(req)}/comprar.html?produto=${encodeURIComponent(product.slug)}&utm_source=email&utm_medium=automation&utm_campaign=checkout_abandonment`}).catch(error=>console.error('abandon_email',error));
      }
      return res.status(200).json({received:true,expired:true});
    }

    if (event.type==='payment_intent.payment_failed') {
      const pi=event.data?.object;
      if (!pi?.id || !belongs(pi.metadata||{})) return res.status(200).json({received:true,ignored:true});
      const session=await sessionForPaymentIntent(pi.id).catch(()=>null);
      if (session?.id) await rpc('crm_order_failed',{p_session:session.id}).catch(()=>null);
      const product=getProduct(pi.metadata.product_slug),email=pi.receipt_email;
      if (product&&email) await sendPaymentFailedEmail({to:email,productName:product.name,returnUrl:`${baseUrl(req)}/comprar.html?produto=${encodeURIComponent(product.slug)}&utm_source=email&utm_medium=transactional&utm_campaign=payment_failed`}).catch(error=>console.error('failed_email',error));
      return res.status(200).json({received:true,failed:true});
    }

    if (event.type==='charge.refunded') {
      const charge=event.data?.object;
      const piId=typeof charge?.payment_intent==='string'?charge.payment_intent:null;
      const session=await sessionForPaymentIntent(piId).catch(()=>null);
      if (session?.id && belongs(session.metadata||{})) await rpc('crm_order_refunded',{p_session:session.id}).catch(()=>null);
      return res.status(200).json({received:true,refunded:true});
    }

    return res.status(200).json({received:true});
  } catch (error) {
    console.error('stripe-webhook',error);
    return res.status(500).end('Webhook error');
  }
};

module.exports.config={api:{bodyParser:false}};
