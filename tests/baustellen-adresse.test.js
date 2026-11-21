// Adresse der Baustelle: aus Angebot/Rechnung/Kunde übernehmen, Vorschläge zum Antippen, Strecke nimmt das Feld,
// Aufmaß hat ein eigenes Adressfeld und schreibt es an die Baustelle.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:kunden', JSON.stringify([{ id: 'k1', name: 'Petra Meier', ckind: 'privat', address: 'Lindenweg 2, 18510 Zarrendorf', _t: 1 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', title: 'Bad EG', party: 'Petra Meier', ckind: 'privat', site: '', status: 'In Arbeit', amount: 0, date: '2026-11-02', _t: 1 },
      { id: 'b2', kind: 'kunde', title: 'Lobby', party: 'Hotel Strandblick', ckind: 'firma', site: '', address: 'Strandpromenade 3, Binz', status: 'Anfrage', amount: 0, date: '2026-11-10', _t: 1 }]));
    localStorage.setItem('belegbuch:angebote', JSON.stringify([{ id: 'g1', auftragId: 'b1', nr: 'A-2026-004', date: '2026-11-04', status: 'Angenommen', ckind: 'privat', site: '', address: 'Am Teich 4, 18442 Steinhagen', vat: 0, discount: 0, positions: [], _t: 1 }]));
    localStorage.setItem('belegbuch:ui-fa', JSON.stringify({ kind: 'kunde', open: true }));
  });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="auftraege"]');
  await page.click('#auftraegeList article:has-text("Bad EG") .vendor'); await page.waitForSelector('#f-site');
  assert(await page.inputValue('#f-site') === 'Am Teich 4, 18442 Steinhagen' && /Angebot A-2026-004/.test(await page.textContent('#siteFillHint')), 'leere Baustellen-Adresse aus dem Angebot (Rechnungsadresse eines Privatkunden) übernommen');
  const chips = await page.$$eval('#siteChips [data-act="site-pick"]', e => e.map(x => x.dataset.addr));
  assert(chips.join('|') === 'Lindenweg 2, 18510 Zarrendorf', 'andere bekannte Adresse als Vorschlag: ' + chips.join('|'));
  await page.click('#siteChips [data-act="site-pick"]');
  assert(await page.inputValue('#f-site') === 'Lindenweg 2, 18510 Zarrendorf' && /Adresse des Kunden/.test(await page.textContent('#siteFillHint')), 'Vorschlag antippen übernimmt die Adresse');
  await page.click('[data-act="site-calc"]'); await page.waitForTimeout(200);
  assert(/Zarrendorf/.test(await page.textContent('#siteMsg')) || /Kilometer/.test(await page.textContent('#siteMsg')), 'Strecke rechnet mit der Adresse im Feld: ' + await page.textContent('#siteMsg'));
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Firma: Firmensitz nur als Vorschlag, nicht automatisch
  await page.click('#auftraegeList article:has-text("Lobby") .vendor'); await page.waitForSelector('#f-site');
  assert(await page.inputValue('#f-site') === '' && /Strandpromenade 3, Binz/.test(await page.textContent('#siteChips')), 'Firma: Rechnungsadresse nur als Vorschlag');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Neue Baustelle: Kunde gewählt → Adresse des Privatkunden
  await page.click('#fab'); await page.fill('#f-title', 'Küche'); await page.fill('#f-party', 'Petra Meier'); await page.press('#f-party', 'Tab');
  assert(await page.inputValue('#f-site') === 'Lindenweg 2, 18510 Zarrendorf', 'neue Baustelle: Adresse des Privatkunden vorgeschlagen');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Aufmaß: eigenes Adressfeld, speichert an die Baustelle
  await page.click('#auftraegeList article:has-text("Lobby") [data-act="aufmass"]'); await page.waitForSelector('#am-site');
  await page.fill('#am-site', 'Strandpromenade 5, 18609 Binz');
  await page.fill('#amBody .pos[data-i="0"] [data-f="l"]', '4'); await page.fill('#amBody .pos[data-i="0"] [data-f="b"]', '3');
  await page.click('[data-act="am-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  const lob = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege')).find(x => x.id === 'b2'));
  assert(lob.site === 'Strandpromenade 5, 18609 Binz', 'Adresse aus dem Aufmaß an der Baustelle gespeichert');
  await page.click('#auftraegeList article:has-text("Lobby") .vendor'); await page.waitForSelector('#f-site');
  assert(await page.inputValue('#f-site') === 'Strandpromenade 5, 18609 Binz', 'Baustelle zeigt die Adresse aus dem Aufmaß');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
