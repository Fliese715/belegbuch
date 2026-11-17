const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// Navigation über das Startmenü: erst zurück ins Menü, dann die Kachel antippen.
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
(async()=>{
 const b=await chromium.launch(); const page=await (await b.newContext({viewport:{width:400,height:760},deviceScaleFactor:2})).newPage();
 const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.route('**/*',r=>{const u=r.request().url();return (u.startsWith('file:')||u.includes('cdnjs'))?r.continue():r.abort()});
 await page.addInitScript(()=>{ if(!localStorage.getItem('belegbuch:dokumente')) localStorage.setItem('belegbuch:dokumente',JSON.stringify([{id:'d1',name:'Wuerth Rechnung 6089029440.pdf',date:'2026-11-13',note:'Rechnung',fileId:'abc'}])); });
 await page.goto(APP);
 await page.addStyleTag({content:'[hidden]{display:none!important} body{margin:0}'});
 await page.waitForSelector('.mtile[data-tab="ordner"] b');
 console.log('tab:',await page.textContent('.mtile[data-tab="ordner"] b'));
 await nav(page, 'ordner'); console.log('fab hidden',await page.$eval('#fab',x=>x.hidden),'|',await page.textContent('#ordnerSum'));
 await page.fill('#ordnerName','Dokumente 2026'); await page.press('#ordnerName','Tab'); await page.waitForTimeout(200);
 console.log('tab nach Umbenennung:',await page.textContent('.mtile[data-tab="ordner"] b'));
 await page.fill('.docname','Würth Rechnung Silikon.pdf'); await page.press('.docname','Tab'); await page.waitForTimeout(200);
 console.log(await page.evaluate(()=>JSON.parse(localStorage.getItem('belegbuch:dokumente')).map(d=>d.name).join()), '|', await page.textContent('#ordnerList .badge'));
 await page.click('[data-act="doc-del"]'); console.log(await page.textContent('[data-act="doc-del"]'));
 await page.click('[data-act="doc-del"]'); await page.waitForTimeout(300); console.log('nach Löschen:',await page.textContent('#ordnerSum'));
 console.log('Fehler:',errs.join('|')||'keine'); await b.close();})();
