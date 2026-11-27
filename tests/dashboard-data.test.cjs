const {test}=require('node:test');const assert=require('node:assert/strict');
const {commercialData}=require('../lib/dashboard-data');
const row=(id,fields={})=>({id,created:1789250400,livemode:true,currency:'brl',amount_total:2499,payment_status:'paid',status:'complete',customer_email:'buyer@valid.test',metadata:{site_id:'concurso_audiobook',project_id:'concurso_audiobook',product_slug:'redacao-nivel-fundamental-2026'},...fields});
test('revenue uses paid BRL only, excludes QA and other sites, and reports incomplete history',()=>{
 const data=commercialData([row('1'),row('2',{payment_status:'unpaid',status:'open'}),row('3',{currency:'usd'}),row('4',{customer_email:'qa@example.com'}),row('5',{metadata:{site_id:'other'}}),row('6',{livemode:false})],[],true);
 assert.equal(data.revenue_cents,2499);assert.equal(data.paid_orders,2);assert.equal(data.checkout_count,3);assert.equal(data.pending,1);assert.equal(data.other_currency_orders,1);assert.equal(data.truncated,true);assert.equal(data.rows[0].access_count,null);
});
test('dashboard mostra a cidade da compra, as cidades de acesso e os aparelhos',()=>{
 const meta={site_id:'concurso_audiobook',project_id:'concurso_audiobook',product_slug:'redacao-nivel-fundamental-2026',compra_local:'Goiânia/GO',acesso_locais:'Goiânia/GO; Anápolis/GO',acesso_aparelhos:'aparelhoUm1,aparelhoDo2'};
 const r=commercialData([row('g',{metadata:meta})],[],false).rows[0];
 assert.equal(r.local_compra,'Goiânia/GO');assert.equal(r.locais_acesso,'Goiânia/GO; Anápolis/GO');assert.equal(r.aparelhos,2);
});
test('cidade vem dos cabeçalhos da borda, sem IP, e a lista não repete',()=>{
 const {localDoPedido,somarLocal}=require('../lib/geo');
 assert.equal(localDoPedido({headers:{'x-vercel-ip-city':'Goi%C3%A2nia','x-vercel-ip-country-region':'GO','x-vercel-ip-country':'BR'}}),'Goiânia/GO');
 assert.equal(localDoPedido({headers:{'cf-ipcity':'Lisboa','cf-region-code':'11','cf-ipcountry':'PT'}}),'Lisboa/11 (PT)');
 assert.equal(localDoPedido({headers:{}}),'');
 assert.equal(somarLocal('Goiânia/GO','Goiânia/GO'),null);
 assert.equal(somarLocal('Goiânia/GO','Anápolis/GO'),'Goiânia/GO; Anápolis/GO');
});
