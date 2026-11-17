const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright'); const path = require('path');
// Navigation über das Startmenü: erst zurück ins Menü, dann die Kachel antippen.
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
// E-Rechnungen (XRechnung UBL, ZUGFeRD/CII als XML) einlesen und Jahresübersicht. Die Beispiel-XMLs
// in tests/daten sind selbst geschrieben und nicht gegen die offiziellen Prüfwerkzeuge validiert.
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', street: 'Musterweg 1', city: '18510 Zarrendorf', kleinunt: true }, { id: 'strecken', text: 'Stralsund = 8' }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Bad', party: 'Meier', amount: 0, status: 'Bezahlt', date: '2025-05-01', due: '2025-06-01', terms: 14, siteKm: 10, visits: 2, hours: [{ d: '2025-05-02', h: 8 }, { d: '2025-05-03', h: 6.5 }] }]));
    localStorage.setItem('belegbuch:belege', JSON.stringify([{ id: 'x1', date: '2025-05-02', vendor: 'Würth', gross: 119, vat: 19, cat: 'Material', pay: 'Bar', km: 16 }, { id: 'x2', date: '2025-06-02', vendor: 'Aral', gross: 80, vat: 19, cat: 'Fahrzeug & Kraftstoff', pay: 'Bar' }]));
    const pos = p => [{ text: 'X', qty: 1, unit: 'psch', price: p }];
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([
      { id: 'r1', auftragId: 'b1', nr: 'R-2025-001', type: 'abschlag', status: 'Bezahlt', paidAt: '2025-05-10', date: '2025-05-05', vat: 0, positions: pos(10000) },
      { id: 'r2', auftragId: 'b1', nr: 'R-2025-002', type: 'schluss', status: 'Bezahlt', paidAt: '2025-06-20', date: '2025-06-01', vat: 0, positions: pos(26000), deduct: [{ nr: 'R-2025-001', gross: 10000 }] },
      { id: 'r3', auftragId: 'b1', nr: 'R-2025-003', status: 'Storniert', date: '2025-07-01', vat: 0, positions: pos(500) },
      { id: 'r4', auftragId: 'b1', nr: 'R-2025-004', type: 'storno', status: 'Storno', date: '2025-07-02', vat: 0, positions: [{ text: 'X', qty: -1, unit: 'psch', price: 500 }] },
      { id: 'r5', auftragId: 'b1', nr: 'R-2025-005', status: 'Gestellt', date: '2025-12-01', vat: 0, positions: pos(1000) }]));
  });
  await page.reload(); await page.waitForSelector('#jahrBox', { state: 'attached' }); await nav(page, 'uebersicht');
  await page.selectOption('#jahrSel', '2025'); await page.waitForTimeout(100);
  const j = (await page.textContent('#jahrBox')).replace(/\s+/g, ' ');
  assert(/Rechnungen 2025 \(4\)\s*27\.000,00/.test(j), 'Umsatz 2025: 10.000 + 16.000 + 500 − 500 + 1.000 = 27.000,00 € (4 Rechnungen ohne Storno): ' + j.slice(0, 60));
  assert(/davon offen\s*1\.000,00/.test(j) && /Zahlungseingänge 2025\s*26\.000,00/.test(j), 'offen 1.000 €, Zahlungseingänge 26.000 €');
  assert(/Ausgaben \(2 Belege\)\s*199,00/.test(j) && !/Vorsteuer/.test(j) && /Material\s*119,00/.test(j), 'Ausgaben 199 € nach Kategorie, Kleinunternehmer ohne Vorsteuer');
  assert(/Einkauf 16, Baustellen 40\)\s*56 km/.test(j) && /14:30 Std/.test(j), 'km 16 + 40 = 56, Stunden 14:30');
  assert(/über 25\.000 €/.test(j), 'Hinweis: Umsatz über 25.000 € (Kleinunternehmergrenze)');
  // E-Rechnung UBL
  await nav(page, 'belege'); await page.click('#fab'); await page.waitForSelector('#photoFile');
  await page.setInputFiles('#photoFile', path.join(__dirname, 'daten/xrechnung-ubl.xml')); await page.waitForFunction(() => /E-Rechnung gelesen|keine lesbare/.test(document.querySelector('#photoBox').textContent));
  const f = () => page.evaluate(() => ['f-vendor', 'f-gross', 'f-date', 'f-vat', 'f-vaddr', 'f-place', 'f-note'].map(i => document.getElementById(i).value).join(' | '));
  assert(await f() === 'Baustoffe Nord GmbH | 238,00 | 2026-10-05 | 19 | Werftstraße 10, 18439 Stralsund | Stralsund | Rechnung RE-4711', 'XRechnung (UBL): ' + await f());
  assert(/XRechnung \(UBL\)/.test(await page.textContent('#photoBox')) && /XML/.test(await page.textContent('#photoBox')), 'Meldung nennt das Format, Vorschau „XML“');
  assert(Number((await page.inputValue('#f-km')).replace(',', '.')) === 16, 'Fahrstrecke aus „Meine Strecken“ (8 km × 2)');
  await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  await page.click('#belegeList article:has-text("Baustoffe Nord") [data-act="file-open"]'); await page.waitForSelector('#viewer:not([hidden])');
  const v = (await page.textContent('#viewerBody')).replace(/\s+/g, ' ');
  assert(/Rechnungssteller\s*Baustoffe Nord GmbH/.test(v) && /Fliesenkleber 25 kg · 200\.00/.test(v), 'Anzeige der E-Rechnung mit Positionen');
  await page.click('[data-act="viewer-close"]');
  // E-Rechnung CII
  await page.click('#fab'); await page.setInputFiles('#photoFile', path.join(__dirname, 'daten/zugferd-cii.xml')); await page.waitForFunction(() => /E-Rechnung gelesen|keine lesbare/.test(document.querySelector('#photoBox').textContent));
  assert(await f() === 'Fliesen Hansen KG | 59,50 | 2026-11-03 | 19 | Grünhufer Bogen 5, 18435 Stralsund | Stralsund | Rechnung 2026-0815', 'ZUGFeRD/CII: ' + await f());
  await page.click('[data-act="cancel"]');
  // keine E-Rechnung
  await page.click('#fab'); await page.setInputFiles('#photoFile', { name: 'x.xml', mimeType: 'application/xml', buffer: Buffer.from('<?xml version="1.0"?><foo/>') });
  await page.waitForFunction(() => /keine lesbare/.test(document.querySelector('#photoBox').textContent)); assert(true, 'fremde XML wird abgelehnt');
  console.log('Fehler: ' + (errs.join('|') || 'keine')); await b.close();
})();
