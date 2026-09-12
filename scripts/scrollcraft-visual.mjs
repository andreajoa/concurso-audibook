import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('scrollcraft-artifacts',{recursive:true});
const base=process.env.SCROLLCRAFT_URL||'https://concurso-audibook.vercel.app';
const browser=await chromium.launch({headless:true});

async function coverStats(locator){
  return locator.evaluate(img=>{
    const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.drawImage(img,0,0,64,64);const d=x.getImageData(0,0,64,64).data;let sum=0,sum2=0,n=0,nonWhite=0;for(let i=0;i<d.length;i+=4){const v=(d[i]+d[i+1]+d[i+2])/3;sum+=v;sum2+=v*v;n++;if(d[i]<242||d[i+1]<242||d[i+2]<242)nonWhite++}const avg=sum/n;return{std:Math.sqrt(Math.max(0,sum2/n-avg*avg)),nonWhiteRatio:nonWhite/n,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,complete:img.complete};
  });
}
async function assertCover(page,label){
  const cover=page.locator('.catalog-cover,.checkout-cover img').first();
  if(await cover.count()===0)throw new Error(`${label}: product cover missing`);
  const stats=await coverStats(cover);if(!stats.complete||stats.naturalWidth<100||stats.naturalHeight<100)throw new Error(`${label}: cover did not load ${JSON.stringify(stats)}`);if(stats.std<18||stats.nonWhiteRatio<.12)throw new Error(`${label}: cover looks visually blank ${JSON.stringify(stats)}`);return{cover,stats};
}
async function homeShot(name,viewport,reducedMotion='no-preference'){
  const context=await browser.newContext({viewport,reducedMotion});const page=await context.newPage();await page.goto(base,{waitUntil:'networkidle',timeout:120000});
  const {cover}=await assertCover(page,name);const box=await cover.boundingBox();if(!box||box.width<180||box.height<220||box.y>viewport.height)throw new Error(`${name}: cover not visibly rendered above fold ${JSON.stringify(box)}`);
  if((await page.locator('body').innerText()).toLowerCase().includes('stripe'))throw new Error(`${name}: payment provider name is visible to customer`);
  if(!await page.locator('del').filter({hasText:'R$ 49,99'}).first().isVisible())throw new Error(`${name}: crossed-out reference price not visible`);
  if(viewport.width<=600&&!await page.locator('.mobile-buybar').isVisible())throw new Error(`${name}: mobile buy bar not visible`);
  await page.screenshot({path:`scrollcraft-artifacts/${name}.png`,fullPage:false});await context.close();
}
await homeShot('desktop-hero',{width:1440,height:1100});
await homeShot('mobile-hero',{width:390,height:844});

const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();await page.goto(base,{waitUntil:'networkidle'});
const stackTop=await page.locator('.stack-cards').evaluate(el=>el.getBoundingClientRect().top+scrollY);await page.evaluate(y=>scrollTo(0,y+420),stackTop);await page.waitForTimeout(450);const stackStyle=await page.locator('[data-stack-card]').first().evaluate(el=>({transform:getComputedStyle(el).transform,filter:getComputedStyle(el).filter}));if(stackStyle.transform==='none'&&stackStyle.filter==='none')throw new Error('stacking cards did not respond to scroll');
const trailTop=await page.locator('.trail-section').evaluate(el=>el.getBoundingClientRect().top+scrollY);await page.evaluate(y=>scrollTo(0,y+260),trailTop);await page.waitForTimeout(500);const progress=await page.locator('[data-trail-map]').evaluate(el=>getComputedStyle(el).getPropertyValue('--trail-progress').trim());if(!progress||Number(progress)<=0)throw new Error(`trail signature move did not advance: ${progress}`);await page.screenshot({path:'scrollcraft-artifacts/desktop-signature.png',fullPage:false});await context.close();

await homeShot('desktop-reduced-motion',{width:1440,height:1100},'reduce');

const checkoutContext=await browser.newContext({viewport:{width:1280,height:1000}});const checkoutPage=await checkoutContext.newPage();await checkoutPage.goto(base+'/comprar.html?produto=autores-ibam-2026',{waitUntil:'networkidle',timeout:120000});await assertCover(checkoutPage,'checkout');if((await checkoutPage.locator('body').innerText()).toLowerCase().includes('stripe'))throw new Error('checkout exposes payment provider name to customer');await checkoutPage.fill('#buyer-name','QA Trilha Aprova');await checkoutPage.fill('#buyer-email',`qa-${Date.now()}@example.com`);await checkoutPage.fill('#buyer-whatsapp','11999999999');await checkoutPage.click('#checkout-form button[type="submit"]');await checkoutPage.locator('#embedded-stage:not([hidden])').waitFor({timeout:30000});await checkoutPage.waitForFunction(()=>document.querySelector('#embedded-checkout')?.children.length>0,null,{timeout:30000});await checkoutPage.waitForTimeout(3500);if(await checkoutPage.locator('#embedded-loading').isVisible())throw new Error('embedded loading message remained visible after checkout mount');await checkoutPage.screenshot({path:'scrollcraft-artifacts/checkout-embedded.png',fullPage:false});await checkoutContext.close();

await browser.close();console.log('Scroll Craft visual + embedded checkout verification passed.');
