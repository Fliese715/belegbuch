const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async()=>{
 const b=await chromium.launch(); const page=await (await b.newContext({viewport:{width:400,height:900}})).newPage();
 const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.route('**/*',r=>{const u=r.request().url();return (u.startsWith('file:')||u.includes('cdnjs'))?r.continue():r.abort()});
 await page.addInitScript(()=>{
  localStorage.setItem('belegbuch:settings',JSON.stringify([{id:'firma',street:'Musterweg 1',city:'18439 Stralsund'}]));
  window.__calls=[];
  const mock={callTool:async(srv,tool,input)=>{window.__calls.push([srv,tool,JSON.stringify(input)]);
   if(window.__fail) throw {code:'server_unavailable'};
   if(tool==='search_and_geocode_tool'){ const q=input.q;
     if(/Musterweg/.test(q)) return {content:[{type:'text',text:'1. Musterweg 1\n   Address: Musterweg 1, 18439 Stralsund, Germany\n   Coordinates: 54.242301, 13.07311\n   Type: address'}],payload:'1. Musterweg 1\n   Address: Musterweg 1, 18439 Stralsund, Germany\n   Coordinates: 54.242301, 13.07311'};
     return {content:[{type:'text',text:'x'}],payload:'1. Werftstraße 10\n   Address: Werftstraße 10, 18439 Stralsund, Germany\n   Coordinates: 54.30235, 13.099197'}; }
   return {content:[],payload:{routes:[{distance:13100},{distance:7634}]}};}};
  window.claude={use:n=>Promise.resolve(n==='mcp'?mock:null)};
 });
 await page.goto(APP);
 await page.addStyleTag({content:'[hidden]{display:none!important} body{margin:0}'});
 await page.waitForFunction(()=>document.querySelector('#mode'));
 await page.click('[data-act="tab"][data-tab="belege"]'); await page.click('#fab');
 await page.fill('#f-vaddr','Werftstraße 10, 18439 Stralsund'); await page.click('[data-act="trip-calc"]');
 await page.waitForFunction(()=>/Mapbox:/.test(document.querySelector('#tripMsg').textContent),{timeout:5000});
 console.log('km',await page.inputValue('#f-km'),'|',await page.textContent('#tripMsg'),'|place',await page.inputValue('#f-place'));
 console.log('calls',await page.evaluate(()=>window.__calls.length));
 await page.evaluate(()=>{window.__fail=true}); await page.fill('#f-km',''); await page.fill('#f-place','Stralsund'); await page.click('[data-act="trip-calc"]');
 await page.waitForTimeout(500); console.log('fallback:',await page.inputValue('#f-km'),'|',await page.textContent('#tripMsg'));
 console.log('Fehler:',errs.join('|')||'keine'); await b.close();})();
