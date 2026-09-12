const { verifyPurchase, updateSessionMetadata, baseUrl } = require('../lib/stripe');
const { getProduct } = require('../lib/catalog');
const { sendAccessEmail } = require('../lib/email');
const { rpc } = require('../lib/crm-rpc');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  try {
    const sessionId = String((req.query && req.query.session_id) || '');
    const purchase = await verifyPurchase(sessionId);
    if (!purchase) return res.status(200).json({ paid: false });
    const product = getProduct(purchase.slug);
    const session = purchase.session;
    await rpc('crm_order_paid',{p_session:session.id,p_amount:Number(session.amount_total||product.priceCents)}).catch(error=>console.error('crm_paid_status',error));
    if (!session.metadata?.access_email_sent && purchase.email) {
      const accessUrl=`${baseUrl(req)}/acesso?session_id=${encodeURIComponent(session.id)}`;
      try {
        await sendAccessEmail({to:purchase.email,productName:product.name,accessUrl,idempotencyKey:`purchase-access-${session.id}`});
        await updateSessionMetadata(session.id,{access_email_sent:`status-${Date.now()}`});
      } catch (error) {
        console.error('access_email_status',error);
      }
    }
    return res.status(200).json({ paid: true, slug: product.slug, name: product.name });
  } catch (error) {
    console.error('order-status', error);
    return res.status(500).json({ paid: false, error: 'Falha ao consultar o pagamento.' });
  }
};
