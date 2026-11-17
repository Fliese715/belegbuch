const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// Navigation über das Startmenü: erst zurück ins Menü, dann die Kachel antippen.
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
(async()=>{
 const b=await chromium.launch(); const page=await (await b.newContext({viewport:{width:400,height:900}})).newPage();
 const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.route('**/*',r=>{const u=r.request().url();return (u.startsWith('file:')||u.includes('cdnjs'))?r.continue():r.abort()});
 const y=new Date().getFullYear(), m=String(new Date().getMonth()+1).padStart(2,'0');
 await page.addInitScript(([y,m])=>{
  localStorage.setItem('belegbuch:settings',JSON.stringify([{id:'firma',street:'Musterweg 1',city:'18439 Stralsund'}]));
  localStorage.setItem('belegbuch:belege',JSON.stringify([{id:'a',date:y+'-'+m+'-02',vendor:'A',gross:10,vat:19,cat:'Material',pay:'Bar',km:15.3}]));
  localStorage.setItem('belegbuch:auftraege',JSON.stringify([{id:'x1',kind:'kunde',title:'Bad EG',party:'Meier',site:'Lindenweg 12, 18439 Stralsund',amount:1000,status:'In Arbeit',date:y+'-'+m+'-05',due:y+'-12-01',terms:14},{id:'x2',kind:'kunde',title:'Küche',party:'Schulz',site:'',amount:500,status:'Angebot',date:y+'-'+m+'-06',due:y+'-12-01',terms:14}]));
  const mock={callTool:async(s,tool,input)=>{
   if(tool==='search_and_geocode_tool'){ if(/Musterweg/.test(input.q)) return {payload:'1. K\n   Address: Musterweg 1, 18439 Stralsund\n   Coordinates: 54.242301, 13.07311'}; return {payload:'1. Lindenweg 12\n   Address: Lindenweg 12, 18439 Stralsund, Germany\n   Coordinates: 54.30, 13.09'};}
   return {payload:{routes:[{distance:9800},{distance:8400}]}};}};
  window.claude={use:n=>Promise.resolve(n==='mcp'?mock:null)};
 },[y,m]);
 await page.goto(APP);
 await page.addStyleTag({content:'[hidden]{display:none!important} body{margin:0}'});
 await page.waitForSelector('.mtile'); await nav(page, 'uebersicht'); await page.waitForSelector('#tiles .tile');
 console.log((await page.$$eval('#tiles .tile',t=>t.map(x=>x.innerText.replace(/\n/g,' | ')))).slice(4).join('\n'));
 await nav(page, 'auftraege');
 await page.click('#auftraegeList article.row .vendor');
 await page.waitForSelector('#f-skm');
 await page.click('[data-act="site-calc"]'); await page.waitForFunction(()=>/Mapbox:/.test(document.querySelector('#siteMsg').textContent));
 console.log('skm',await page.inputValue('#f-skm'),'|',await page.textContent('#siteMsg'));
 await page.fill('#f-svis','3'); console.log(await page.textContent('#siteTotal'));
 await page.click('[data-act="save"]'); await page.waitForTimeout(400);
 console.log('stored',await page.evaluate(()=>JSON.parse(localStorage.getItem('belegbuch:auftraege')).map(a=>[a.id,a.siteKm,a.visits].join(':')).join(' ')));
 await nav(page, 'uebersicht');
 console.log((await page.$$eval('#tiles .tile',t=>t.map(x=>x.innerText.replace(/\n/g,' | ')))).slice(4).join('\n'));
 await page.click('#tiles .tile[data-go="sitekm"]'); console.log('rows',(await page.$$('#auftraegeList article')).length,'|',await page.textContent('#fa-note'),'|',(await page.textContent('#auftraegeList')).match(/Fahrten[^·]*/)?.[0]);
 console.log('Fehler:',errs.join('|')||'keine'); await b.close();})();
