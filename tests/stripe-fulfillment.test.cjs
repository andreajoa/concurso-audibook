const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');

test('signed paid events use the same email key as return-page fulfillment; unpaid and foreign events cannot deliver',async()=>{
  const secret='test-only-webhook-secret';
  const oldSecret=process.env.STRIPE_WEBHOOK_SECRET;
  const paths=['../lib/stripe','../lib/email','../lib/crm-rpc'];
  const originals=paths.map(path=>{require(path);return require.cache[require.resolve(path)].exports;});
  const sent=[];
  let stripeReads=0;
  const session={id:'cs_test_fulfillment',payment_status:'paid',amount_total:2499,
    metadata:{site_id:'concurso_audiobook',project_id:'concurso_audiobook',product_slug:'sme-sp-peif-pre-edital-2026'}};
  require.cache[require.resolve(paths[0])].exports={
    baseUrl:()=> 'https://test.invalid',retrieveCheckoutSession:async()=>{stripeReads++;return session;},
    updateSessionMetadata:async()=>{},isPaidAndNotRefunded:s=>s.payment_status==='paid',
    sessionEmail:()=> 'fixture@example.invalid',sessionProduct:s=>s.metadata.product_slug,request:async()=>({})
  };
  require.cache[require.resolve(paths[1])].exports={sendAccessEmail:async message=>sent.push(message)};
  require.cache[require.resolve(paths[2])].exports={rpc:async()=>null};
  const handlerPath=require.resolve('../api/stripe-webhook');
  delete require.cache[handlerPath];
  const handler=require(handlerPath);
  process.env.STRIPE_WEBHOOK_SECRET=secret;
  async function dispatch(type,metadata=session.metadata,tamper=false){
    const payload=Buffer.from(JSON.stringify({id:'evt_test',type,data:{object:{id:session.id,metadata}}}));
    const timestamp=Math.floor(Date.now()/1000);
    const signature=crypto.createHmac('sha256',secret).update(`${timestamp}.${payload}`).digest('hex');
    const req=Readable.from([payload]);req.method='POST';req.headers={'stripe-signature':`t=${timestamp},v1=${tamper?'0'.repeat(64):signature}`};
    const res={code:0,status(n){this.code=n;return this;},json(body){this.body=body;return this;},end(body){this.body=body;return this;}};
    await handler(req,res);return res;
  }
  try{
    assert.equal((await dispatch('checkout.session.completed')).code,200);
    assert.equal((await dispatch('checkout.session.async_payment_succeeded')).code,200);
    assert.deepEqual(sent.map(m=>m.idempotencyKey),['purchase-access-cs_test_fulfillment','purchase-access-cs_test_fulfillment']);
    assert.ok(sent.every(m=>m.accessUrl==='https://test.invalid/acesso?session_id=cs_test_fulfillment'));
    session.payment_status='unpaid';await dispatch('checkout.session.completed');
    assert.equal(sent.length,2);
    const reads=stripeReads;
    await dispatch('checkout.session.completed',{site_id:'another_store',project_id:'another_store'});
    assert.equal(stripeReads,reads);
    assert.equal((await dispatch('checkout.session.completed',session.metadata,true)).code,400);
    assert.equal(sent.length,2);
  }finally{
    paths.forEach((path,i)=>{require.cache[require.resolve(path)].exports=originals[i];});
    delete require.cache[handlerPath];
    if(oldSecret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=oldSecret;
  }
});
