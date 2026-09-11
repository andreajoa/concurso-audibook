const {request,baseUrl}=require('./stripe');
const {getProduct}=require('./catalog');
async function createEmbedded(req,slug){const product=getProduct(slug);if(!product)throw new Error('Produto indisponível.');const params={mode:'payment',ui_mode:'embedded',redirect_on_completion:'always',return_url:`${baseUrl(req)}/obrigado.html?session_id={CHECKOUT_SESSION_ID}`,locale:'pt-BR','line_items[0][quantity]':1,'line_items[0][price_data][currency]':product.currency,'line_items[0][price_data][unit_amount]':product.priceCents,'line_items[0][price_data][product_data][name]':product.name,'metadata[site_id]':'concurso_audiobook','metadata[product_slug]':product.slug};return request('/checkout/sessions',{method:'POST',params});}
module.exports={createEmbedded};
