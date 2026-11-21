// Adresse der Baustelle: fehlt sie an der Baustelle, übernimmt das Formular sie aus Rechnung, Angebot, Termin
// oder (Privatkunde) der Kundenadresse; Angebot/Rechnung tragen ihre Adresse an der Baustelle nach.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:kunden', JSON.stringify([{ id: 'k1', name: 'Petra Meier', ckind: 'privat', address: 'Dorfstraße 1, 18510 Zarrendorf', _t: 1 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', title: 'Bad EG', party: 'Hotel Strandblick', status: 'In Arbeit', amount: 0, date: '2026-11-02', _t: 1 },
      { id: 'b2', kind: 'kunde', title: 'Terrasse', party: 'Petra Meier', status: 'Anfrage', amount: 0, date: '2026-11-03', _t: 1 },
      { id: 'b3', kind: 'kunde', title: 'Küche', party: 'Firma X', status: 'Anfrage', amount: 0, date: '2026-11-04', _t: 1 }]));
    localStorage.setItem('belegbuch:angebote', JSON.stringify([{ id: 'g1', auftragId: 'b1', nr: 'A-2026-004', date: '2026-11-04', status: 'Versendet', ckind: 'firma', vat: 19, site: 'Strandpromenade 3, 18609 Binz', positions: [{ text: 'x', qty: 1, price: 1 }], _t: 1 }]));
    localStorage.setItem('belegbuch:ui-fa', JSON.stringify({ kind: 'kunde', open: true }));
  });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="auftraege"]');
  const openSite = async t => { await page.click('#auftraegeList article:has-text("' + t + '") .vendor'); await page.waitForSelector('#f-site'); const r = [await page.inputValue('#f-site'), (await page.$('#siteFillHint')) ? await page.textContent('#siteFillHint') : '']; return r; };
  let r = await openSite('Bad EG');
  assert(r[0] === 'Strandpromenade 3, 18609 Binz' && /Angebot A-2026-004/.test(r[1]), 'aus dem Angebot übernommen: ' + r.join(' | '));
  await page.click('[data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege'))[0].site === 'Strandpromenade 3, 18609 Binz'), 'beim Speichern an der Baustelle eingetragen');
  r = await openSite('Terrasse');
  assert(r[0] === 'Dorfstraße 1, 18510 Zarrendorf' && /Adresse des Kunden/.test(r[1]), 'Privatkunde: Kundenadresse vorgeschlagen');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  r = await openSite('Küche');
  assert(r[0] === '' && !r[1] && (await page.getAttribute('#f-site', 'placeholder')) === 'Straße Nr., PLZ Ort', 'ohne Quelle: leer, keine Beispieladresse');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Angebot mit Adresse → Baustelle bekommt sie
  await page.click('#auftraegeList article:has-text("Küche") [data-act="angebot"]'); await page.waitForSelector('#angBody');
  await page.click('.stepper [data-step="1"]'); await page.fill('#a-site', 'Hafenstraße 9, 18439 Stralsund');
  await page.click('[data-act="ang-save"]'); await page.waitForTimeout(200);
  if (await page.isVisible('#sheet')) { await page.click('.stepper [data-step="2"]'); await page.selectOption('#angAdd', 'stunde'); await page.click('[data-act="ang-save"]'); }
  await page.waitForSelector('#sheet', { state: 'hidden' });
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege')).find(a => a.id === 'b3').site === 'Hafenstraße 9, 18439 Stralsund'), 'Adresse aus dem Angebot an der Baustelle nachgetragen');
  // Termin als Quelle
  await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('belegbuch:auftraege')); a.push({ id: 'b4', kind: 'kunde', title: 'Flur', party: 'Firma Y', status: 'Anfrage', amount: 0, date: '2026-11-05', _t: 1 }); localStorage.setItem('belegbuch:auftraege', JSON.stringify(a)); localStorage.setItem('belegbuch:termine', JSON.stringify([{ id: 't1', title: 'Aufmaß', date: '2026-11-30', auftragId: 'b4', place: 'Am Markt 5, 18528 Bergen', _t: 1 }])); });
  await page.reload(); await page.waitForSelector('#auftraegeList');
  r = await openSite('Flur');
  assert(r[0] === 'Am Markt 5, 18528 Bergen' && /Termin „Aufmaß“/.test(r[1]), 'aus dem Termin übernommen');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
