const test=require('node:test');
const assert=require('node:assert');

function withFetch(handler, fn) {
  return async () => {
    const real=global.fetch, calls=[];
    global.fetch=async (url, init) => { calls.push({url:String(url), body:init&&init.body?JSON.parse(init.body):null}); return handler(String(url), calls); };
    Object.assign(process.env,{RESEND_API_KEY:'re_x',NOVAMAIL_API_KEY:'nm_x',EMAIL_FROM:'Trilha Aprova <novidades@concursotrilhaaprova.online>'});
    delete process.env.BREVO_API_KEY;
    try { await fn(calls); } finally { global.fetch=real; }
  };
}
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json'}});
const {sendAccessEmail,sendAbandonedCheckoutEmail}=require('../lib/email');

test('transbordo: Resend no limite → NovaMail (sem Brevo configurado), remetente em mail.', withFetch(
  (url)=>url.includes('resend')?json({name:'daily_quota_exceeded',message:'You have reached your daily email sending quota.'},429):json({id:'nm1'}),
  async (calls)=>{
    const r=await sendAccessEmail({to:'a@b.com',productName:'X',accessUrl:'https://x'});
    assert.deepEqual(r,{provider:'novamail',id:'nm1'});
    assert.equal(calls[1].body.from,'Trilha Aprova <novidades@mail.concursotrilhaaprova.online>');
  }));

test('erro comum do Resend não vira transbordo', withFetch(
  (url)=>url.includes('resend')?json({message:'Invalid `to` field.'},422):json({id:'nm1'}),
  async (calls)=>{
    await assert.rejects(sendAccessEmail({to:'a@b.com',productName:'X',accessUrl:'https://x'}),/Invalid/);
    assert.equal(calls.length,1);
  }));

test('follow-up sai pelo NovaMail; se ele falhar, volta para o Resend', withFetch(
  (url,calls)=>url.includes('novamail')?json({message:'down'},503):json({id:'re1'}),
  async (calls)=>{
    const r=await sendAbandonedCheckoutEmail({to:'a@b.com',productName:'X',returnUrl:'https://x'});
    assert.deepEqual(r,{provider:'resend',id:'re1'});
    assert.ok(calls[0].url.includes('novamail'));
  }));
