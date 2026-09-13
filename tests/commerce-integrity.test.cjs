const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog}=require('../lib/catalog');
const {validateProductAssets,signedProductAssets}=require('../lib/r2');
const {verifyPurchase}=require('../lib/stripe');
const {createCheckout}=require('../lib/checkout-hosted');
process.env.STRIPE_SECRET_KEY='test-only-not-a-real-key';
process.env.R2_ACCESS_KEY_ID='test-only';process.env.R2_SECRET_ACCESS_KEY='test-only';
const originalFetch=global.fetch;
test('each product owns exactly its PDF, cover, summary and eight chapter files',async()=>{
  const allKeys=new Set();
  for(const product of Object.values(catalog)){
    validateProductAssets(product);
    const signed=await signedProductAssets(product);
    assert.equal(signed.tracks.length,9);
    assert.equal(signed.tracks[0].id,'summary');
    for(const url of [signed.pdf,signed.cover,...signed.tracks.map(t=>t.streamUrl)]){
      const path=decodeURIComponent(new URL(url).pathname);assert.ok(path.includes('/'+product.slug+'/'));
      assert.ok(!allKeys.has(path));allKeys.add(path);
    }
  }
  const mixed=structuredClone(catalog['redacao-nivel-fundamental-2026']);mixed.assets.pdfKey=catalog['autores-ibam-2026'].assets.pdfKey;
  assert.throws(()=>validateProductAssets(mixed),/purchased product/);
});
test('checkout creates and delivery validates the selected product, site and payment',async()=>{
  try{
    for(const product of Object.values(catalog)){
      let sent;
      global.fetch=async(url,init)=>{sent=new URLSearchParams(init.body);return{ok:true,json:async()=>({id:'cs_test_only'})};};
      await createCheckout({headers:{host:'test.local'}},product.slug,{email:'test@example.com',embedded:true});
      assert.equal(sent.get('metadata[product_slug]'),product.slug);
      assert.equal(sent.get('metadata[site_id]'),'concurso_audiobook');
      assert.equal(sent.get('payment_intent_data[metadata][product_slug]'),product.slug);
      const session={payment_status:'paid',metadata:{product_slug:product.slug,site_id:'concurso_audiobook',project_id:'concurso_audiobook'}};
      global.fetch=async()=>({ok:true,json:async()=>session});
      assert.equal((await verifyPurchase('cs_test_only')).slug,product.slug);
      assert.equal(await verifyPurchase('cs_test_only','unrelated-product'),null);
      session.payment_status='unpaid';assert.equal(await verifyPurchase('cs_test_only'),null);
      session.payment_status='paid';session.payment_intent={latest_charge:{refunded:true}};assert.equal(await verifyPurchase('cs_test_only'),null);
      delete session.payment_intent;session.metadata.site_id='another-site';assert.equal(await verifyPurchase('cs_test_only'),null);
    }
  }finally{global.fetch=originalFetch;}
});
