const {test}=require('node:test');const assert=require('node:assert/strict');
const {sendContactEmail}=require('../lib/email');
test('contact is sent only to support with all fields and reply-to set to the visitor',async()=>{
 const original=global.fetch;process.env.RESEND_API_KEY='test-only';let payload;
 global.fetch=async(url,init)=>{payload=JSON.parse(init.body);return{ok:true,json:async()=>({id:'test-message'})};};
 try{await sendContactEmail({name:'Pessoa de teste',phone:'00000000000',email:'visitor@example.com',subject:'Teste de suporte',message:'Mensagem <script>insegura</script>',requestId:'test-only-request'});
 assert.deepEqual(payload.to,['suporte@concursotrilhaaprova.online']);assert.equal(payload.reply_to,'visitor@example.com');for(const value of ['Pessoa de teste','00000000000','visitor@example.com','Teste de suporte','&lt;script&gt;'])assert.ok(payload.html.includes(value));assert.ok(!payload.html.includes('<script>'));
 }finally{global.fetch=original;delete process.env.RESEND_API_KEY;}
});
