import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const required=['public/index.html','public/styles.css','public/app.js','public/materials.json','scripts/build-assets.sh','vercel.json'];
let failed=false;
for(const file of required){if(!fs.existsSync(path.join(root,file))){console.error(`MISSING ${file}`);failed=true}else console.log(`OK ${file}`)}
const materials=JSON.parse(fs.readFileSync(path.join(root,'public/materials.json'),'utf8'));
for(const m of materials){for(const key of ['id','title','pdf','audio','cover']){if(!m[key]){console.error(`Material ${m.id||'?'} missing ${key}`);failed=true}}}
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for(const id of ['biblioteca','como-funciona','proximos','study-modal']){if(!html.includes(`id="${id}"`)){console.error(`HTML missing #${id}`);failed=true}}
const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');
if(!css.includes('prefers-reduced-motion')){console.error('Reduced motion handling missing');failed=true}
if(failed)process.exit(1);console.log(`Verification passed: ${materials.length} material(s), core navigation, study modal and accessibility hooks present.`);
