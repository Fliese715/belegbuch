const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const fs=require('fs');
const F=APP;
async function dev(b,seed){ const ctx=await b.newContext({viewport:{width:400,height:800},acceptDownloads:true}); const page=await ctx.newPage(); page.errs=[]; page.on('pageerror',e=>page.errs.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 if(seed) await page.addInitScript(s=>{ if(!localStorage.getItem('seeded')){localStorage.setItem('seeded','1'); for(const k in s) localStorage.setItem('belegbuch:'+k,JSON.stringify(s[k]));}},seed);
 await page.goto(F); await page.waitForSelector('#syncInfo', { state: 'attached' }); return page; }
const save=async(page,name)=>{ await page.click('[data-act="tab"][data-tab="sicherung"]'); const [d]=await Promise.all([page.waitForEvent('download'),page.click('[data-act="sync-save"]')]); await d.saveAs(name); return d.suggestedFilename(); };
const load=async(page,name)=>{ await page.click('[data-act="tab"][data-tab="sicherung"]'); await page.setInputFiles('#syncFile',name); await page.waitForFunction(()=>/Abgleich:|keine|nicht/.test(document.querySelector('#syncMsg').textContent)); return page.textContent('#syncMsg'); };
const ids=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('belegbuch:belege')).map(b=>b.id+'='+b.vendor).sort().join(', '));
const newBeleg=async(p,v)=>{ await p.click('[data-act="tab"][data-tab="belege"]'); await p.click('#fab'); await p.fill('#f-vendor',v); await p.fill('#f-gross','12,50'); await p.click('[data-act="save"]'); await p.waitForTimeout(300); await p.click('[data-act="tab"][data-tab="uebersicht"]'); };
(async()=>{ const b=await chromium.launch();
 const A=await dev(b,{belege:[{id:'x1',date:'2026-11-10',vendor:'Würth',gross:10,vat:19,cat:'Material',pay:'Bar'},{id:'x2',date:'2026-11-11',vendor:'Famila',gross:3,vat:19,cat:'Material',pay:'Bar'}],settings:[{id:'firma',street:'Musterweg 1',city:'18439 Stralsund'}]});
 const B=await dev(b,null);
 console.log('Dateiname',await save(A,TMP+'/t1.json'));
 console.log('B lädt:',await load(B,TMP+'/t1.json'),'|',await ids(B));
 await newBeleg(B,'Hornbach');
 // B ändert x1, B löscht x2 (über Formular)
 await B.click('[data-act="tab"][data-tab="belege"]'); await B.click('#belegeList article:has-text("Würth")'); await B.fill('#f-vendor','Würth NEU'); await B.click('[data-act="save"]'); await B.waitForTimeout(300);
 await B.click('#belegeList article:has-text("Famila")'); const del=B.locator('#sheet [data-act*="del"]').first(); await del.click(); await B.waitForTimeout(200); if(await B.locator('#sheet [data-act*="del"]').count()) await B.locator('#sheet [data-act*="del"]').first().click().catch(()=>{}); await B.waitForTimeout(300);
 console.log('B danach:',await ids(B));
 await newBeleg(A,'Bauhaus');
 await B.click('[data-act="tab"][data-tab="uebersicht"]'); await save(B,TMP+'/t2.json');
 console.log('A lädt:',await load(A,TMP+'/t2.json'),'|',await ids(A));
 await save(A,TMP+'/t3.json'); console.log('B lädt:',await load(B,TMP+'/t3.json'),'|',await ids(B));
 console.log('falsche Datei:',await (async()=>{fs.writeFileSync(TMP+'/bad.json','{"a":1}'); return load(A,TMP+'/bad.json');})());
 console.log('Modus:',await A.textContent('#mode'),'|',await A.textContent('#syncInfo'));
 console.log('Fehler A:',A.errs.join('|')||'keine','B:',B.errs.join('|')||'keine'); await b.close();})();
