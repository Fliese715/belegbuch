// Belege-Erinnerung: Antippen öffnet „+ Beleg“, erst ein gespeicherter Beleg macht sie grün; Link #beleg-neu öffnet das Formular direkt.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 400, height: 800 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP + '#erledigen'); await page.waitForSelector('#remindBox .remind');
  assert(/Tippen: \+ Beleg/.test(await page.textContent('#remindBox')) && !(await page.$('.remindchk')) && !/done/.test(await page.getAttribute('#remindBox .remind', 'class')), 'Erinnerung rot mit „Tippen: + Beleg“, ohne Abhak-Knopf');
  await page.click('#remindBox .remind'); await page.waitForSelector('#f-vendor');
  assert(await page.textContent('#sheetTitle') === 'Neuer Beleg', 'Antippen öffnet „Neuer Beleg“');
  await page.fill('#f-vendor', 'Hornbach'); await page.fill('#f-gross', '19,90'); await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  await page.goto(APP + '#erledigen'); await page.waitForSelector('#remindBox .remind');
  assert(/eingegeben/.test(await page.textContent('#remindBox .remind')) && /done/.test(await page.getAttribute('#remindBox .remind', 'class')), 'erst nach dem Speichern eines Belegs ist die Kachel grün');
  const p2 = await ctx.newPage(); await p2.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await p2.goto(APP + '#beleg-neu'); await p2.waitForSelector('#f-vendor');
  assert(await p2.textContent('#sheetTitle') === 'Neuer Beleg' && p2.url().endsWith('#belege'), 'Link #beleg-neu öffnet direkt „Neuer Beleg“');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
