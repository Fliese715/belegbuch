const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// Navigation über das Startmenü: erst zurück ins Menü, dann die Kachel antippen.
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
(async()=>{
 const b=await chromium.launch(); const page=await (await b.newContext({viewport:{width:400,height:900},deviceScaleFactor:2})).newPage();
 const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.route('**/*',r=>{const u=r.request().url();return (u.startsWith('file:')||u.includes('cdnjs'))?r.continue():r.abort()});
 const t=new Date().toISOString().slice(0,10);
 await page.addInitScript(t=>{try{
  localStorage.setItem('belegbuch:auftraege',JSON.stringify([{id:'a1',kind:'kunde',title:'Bad EG',party:'Hotel Strandblick',site:'Binz',status:'Abgenommen',amount:2000,date:t,due:t},{id:'a2',kind:'kunde',title:'Küche',party:'Meyer',status:'In Arbeit',amount:900,date:t,ckind:'privat'},
   {id:'l1',kind:'lieferant',title:'Fliesenkleber',party:'Würth',status:'Bestellt',amount:762.48,date:t,due:t},{id:'l2',kind:'lieferant',title:'Fliesen 60x60',party:'Hagebau',status:'Geliefert',amount:1200,date:t}]));}catch(e){}},t);
 await page.goto(APP);
 await page.addStyleTag({content:'[hidden]{display:none!important} body{margin:0}'});
 await page.waitForFunction(()=>document.querySelector('#mode').textContent.includes('Gerät'));
 await nav(page, 'auftraege');
 console.log('Kunden:', (await page.textContent('#auftraegeSum')).replace(/\s+/g,' '));
 await page.click('[data-act="fa-kind"][data-kind="lieferant"]');
 console.log('Lieferant:', (await page.textContent('#auftraegeSum')).replace(/\s+/g,' '));
 await page.click('#fab'); console.log('Neuer Auftrag Art:', await page.inputValue('#f-kind')); await page.click('[data-act="cancel"]');
 await page.click('[data-act="fa-kind"][data-kind="all"]');
 console.log('Alle:', (await page.textContent('#auftraegeSum')).replace(/\s+/g,' '),'|',(await page.$$eval('.grp-h',e=>e.map(x=>x.textContent))).join(' // '));
 console.log('Overflow:', await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)); console.log('Fehler:',errs.join('|')||'keine');
 await b.close();})();
