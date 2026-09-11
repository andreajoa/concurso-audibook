import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const required=['public/index.html','public/comprar.html','public/store.css','public/checkout.js','public/obrigado.html','public/recuperar.html','api/checkout.js','api/access-page.js','api/stripe-webhook.js','products/catalog.json','vercel.json'];
let failed=false;const fail=m=>{console.error('FAIL '+m);failed=true},ok=m=>console.log('OK   '+m);
for(const file of required){fs.existsSync(path.join(root,file))?ok(file):fail('missing '+file)}
if(fs.existsSync(path.join(root,'public/materials.json')))fail('public/materials.json must not expose paid asset URLs');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for(const marker of ['R$ 49,99','R$ 24,99','Pagamento único','Stripe','audiobook','PDF','buy-button'])if(!html.includes(marker))fail('sales home missing '+marker);
if(/materials\.json|\/app\.js|pub-[a-z0-9]+\.r2\.dev/i.test(html))fail('sales home exposes legacy/public library assets');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'products/catalog.json'),'utf8'));
const product=catalog['autores-ibam-2026'];
if(!product||product.priceCents!==2499||product.compareAtCents!==4999)fail('catalog price configuration invalid');
if(!product?.assets?.pdfKey||!Array.isArray(product?.assets?.chapters)||product.assets.chapters.length!==8)fail('paid product asset map invalid');
const access=fs.readFileSync(path.join(root,'api/access-page.js'),'utf8');
for(const marker of ['verifyPurchase','signedProductAssets','no-store','noindex'])if(!access.includes(marker))fail('paid access missing '+marker);
if(failed)process.exit(1);
console.log('\nVerification passed: sales home + Stripe paywall + buyer-only asset delivery.');
