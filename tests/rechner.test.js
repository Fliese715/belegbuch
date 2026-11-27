// Rechner: Knopf oben rechts (auch über offenen Formularen), + − × ÷ und Klammern, Ergebnis ins zuletzt aktive Zahlenfeld übernehmen.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  const keys = async s => { for (const k of s) await page.click(`#calcKeys [data-k="${k}"]`); };
  await page.goto(APP); await page.waitForSelector('.mtile');
  assert(await page.isVisible('#calcBtn'), 'Rechner-Knopf im Menü sichtbar');
  await page.click('#calcBtn'); await keys('12,5×4−(3+2)');
  assert(await page.textContent('#calcRes') === '45' && await page.isHidden('#calcUse'), 'Zwischenergebnis 12,5 × 4 − (3 + 2) = 45, ohne Feld kein „Übernehmen“');
  await keys('÷'); await keys('2='); 
  assert(await page.textContent('#calcRes') === '47,5' && await page.textContent('#calcExpr') === '47,5', 'Punkt vor Strich: … − (3 + 2) ÷ 2 = 47,5, „=“ setzt das Ergebnis');
  await keys('C'); await page.keyboard.type('7*3'); await page.keyboard.press('Enter');
  assert(await page.textContent('#calcRes') === '21', 'Tastatur: 7*3 Enter = 21');
  await page.click('[data-act="calc-close"]');
  // im Beleg-Formular: Betrag
  await page.click('.mtile[data-tab="belege"]'); await page.click('#fab'); await page.waitForSelector('#f-gross');
  await page.click('#f-gross'); await page.click('#calcBtn');
  assert(await page.isVisible('#calc') && await page.isVisible('#sheet'), 'Rechner öffnet sich über dem offenen Formular');
  await keys('C'); await keys('19,90+5,10');
  assert(/In „Betrag/.test(await page.textContent('#calcUse')), 'Knopf nennt das Feld: ' + await page.textContent('#calcUse'));
  await page.click('[data-act="calc-use"]');
  assert(await page.inputValue('#f-gross') === '25' && await page.isHidden('#calc'), 'Ergebnis 25 steht im Betrag');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
