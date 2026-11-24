// Kleinunternehmer: Rechnung aus einem Angebot mit 19 % bekommt 0 %; mit Umsatzsteuer lässt sie sich nicht stellen.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'FFH', street: 'Kirchstraße 40', city: '18510 Zarrendorf', taxid: '081/123/45678', kleinunt: true, _t: 1 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Weidenring 12', party: 'Simone Jung', ckind: 'privat', status: 'Angebot', amount: 0, _t: 1 }]));
    localStorage.setItem('belegbuch:angebote', JSON.stringify([{ id: 'g1', auftragId: 'b1', nr: 'A-2026-001', name: 'Simone Jung', address: 'Weidenring 12, 18442 Negast', title: 'Fliesenarbeiten', date: '2026-11-21', status: 'Entwurf', ckind: 'privat', vat: 19, discount: 0, _t: 1,
      positions: [{ art: 'lohn', katId: 'verl-std', text: 'Bodenfliesen verlegen', unit: 'm²', qty: 2, price: 48.5 }] }]));
  });
  await page.goto(APP + '#angebote'); await page.reload(); await page.waitForSelector('[data-act="ang-to-re"]');
  await page.click('[data-act="ang-to-re"]'); await page.waitForSelector('#a-vat');
  assert(await page.inputValue('#a-vat') === '0' && await page.isHidden('#kleinWarn'), 'Rechnung aus Angebot mit 19 %: als Kleinunternehmer 0 % USt');
  await page.selectOption('#a-vat', '19'); await page.click('[data-act="re-issue"]'); await page.waitForTimeout(300);
  const t = await page.textContent('#sheet');
  assert(/Kleinunternehmer.*0 %/.test(t) && await page.isHidden('#viewer'), 'mit 19 % lässt sich die Rechnung nicht stellen');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
