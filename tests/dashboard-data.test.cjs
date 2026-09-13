const {test}=require('node:test');const assert=require('node:assert/strict');
const {commercialData}=require('../lib/dashboard-data');
const row=(id,fields={})=>({id,created:1789250400,livemode:true,currency:'brl',amount_total:2499,payment_status:'paid',status:'complete',customer_email:'buyer@valid.test',metadata:{site_id:'concurso_audiobook',project_id:'concurso_audiobook',product_slug:'redacao-nivel-fundamental-2026'},...fields});
test('revenue uses paid BRL only, excludes QA and other sites, and reports incomplete history',()=>{
 const data=commercialData([row('1'),row('2',{payment_status:'unpaid',status:'open'}),row('3',{currency:'usd'}),row('4',{customer_email:'qa@example.com'}),row('5',{metadata:{site_id:'other'}}),row('6',{livemode:false})],[],true);
 assert.equal(data.revenue_cents,2499);assert.equal(data.paid_orders,2);assert.equal(data.checkout_count,3);assert.equal(data.pending,1);assert.equal(data.other_currency_orders,1);assert.equal(data.truncated,true);assert.equal(data.rows[0].access_count,null);
});
