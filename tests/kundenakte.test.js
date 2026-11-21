// Kundenakte: Klick auf einen Kunden zeigt Baustellen, Termine, Aufmaß, Angebote, Rechnungen, Kosten;
// Einträge öffnen und zurück in die Akte; + Baustelle / + Angebot / + Termin mit Kundendaten.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    localStorage.setItem('belegbuch:kunden', JSON.stringify([{ id: 'k1', name: 'Petra Meier', ckind: 'privat', address: 'Lindenweg 2, 18510 Zarrendorf', phone: '0170 1234567', email: 'meier@test.de', note: '', _t: 1 }, { id: 'k2', name: 'Hotel Strandblick', ckind: 'firma', address: '', phone: '', email: '', note: '', _t: 1 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', title: 'Bad EG', party: 'Petra Meier', ckind: 'privat', site: 'Lindenweg 2', status: 'In Arbeit', amount: 4200, date: d(-20), _t: 1, aufmass: { date: d(-18), waste: 10, rows: [{ room: 'Bad', type: 'boden', l: '2,45+1,8', b: '1,8', n: '1', abz: '' }] } },
      { id: 'b2', kind: 'kunde', title: 'Terrasse', party: 'petra meier', status: 'Anfrage', amount: 0, date: d(-3), _t: 1 },
      { id: 'b3', kind: 'kunde', title: 'Lobby', party: 'Hotel Strandblick', status: 'Beauftragt', amount: 9000, date: d(-5), _t: 1 }]));
    localStorage.setItem('belegbuch:angebote', JSON.stringify([{ id: 'g1', auftragId: 'b1', nr: 'A-2026-004', date: d(-17), status: 'Angenommen', ckind: 'privat', vat: 0, discount: 0, positions: [{ text: 'x', qty: 30, price: 55 }], _t: 1 }, { id: 'g2', auftragId: 'b3', nr: 'A-2026-005', date: d(-4), status: 'Versendet', ckind: 'firma', vat: 19, discount: 0, positions: [{ text: 'y', qty: 1, price: 100 }], _t: 1 }]));
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([{ id: 'r1', auftragId: 'b1', nr: 'R-2026-007', type: 'abschlag', date: d(-8), status: 'Gestellt', ckind: 'privat', vat: 0, discount: 0, positions: [{ text: '1. Abschlag', qty: 1, price: 1500 }], _t: 1 }]));
    localStorage.setItem('belegbuch:termine', JSON.stringify([{ id: 't1', title: 'Fugen', date: d(3), time: '08:00', auftragId: 'b1', remind: 'beides', _t: 1 }, { id: 't2', title: 'Besichtigung', date: d(1), baustelle: 'Terrasse', remind: 'beides', _t: 1 }, { id: 't3', title: 'Lobby Termin', date: d(2), auftragId: 'b3', _t: 1 }]));
    localStorage.setItem('belegbuch:belege', JSON.stringify([{ id: 'e1', vendor: 'Hornbach', date: d(-15), gross: 312.4, vat: 19, cat: 'Material', orderId: 'b1', _t: 1 }, { id: 'e2', vendor: 'Bauhaus', date: d(-14), gross: 87.6, vat: 19, cat: 'Material', orderId: 'b1', _t: 1 }]));
  });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="kunden"]');
  await page.click('#kundenList article:has-text("Petra Meier")'); await page.waitForSelector('.akstats');
  const sec = async t => (await page.$$eval('#sheetBody .section-h', (h, t) => { const x = h.find(e => e.textContent.startsWith(t)); if (!x) return null; const n = x.nextElementSibling; return x.textContent.replace(/\s+/g, ' ') + ' || ' + n.textContent.replace(/\s+/g, ' '); }, t));
  assert(/Umsatz\s*1\.500,00\s€/.test(await page.textContent('.akstats')) && /Offen\s*1\.500,00\s€/.test(await page.textContent('.akstats')) && /Baustellen\s*2/.test(await page.textContent('.akstats')), 'Kennzahlen Umsatz, offen, Baustellen');
  assert(/BAUSTELLEN 2|Baustellen 2/i.test(await sec('Baustellen')) && /Terrasse.*Bad EG/.test(await sec('Baustellen')), 'Baustellen, neueste zuerst (Name ohne Groß/Klein)');
  const tm = await sec('Termine');
  assert(/Termine 2/i.test(tm) && /Besichtigung.*Terrasse.*Fugen.*Bad EG/.test(tm) && !/Lobby/.test(tm), 'Termine über Baustelle oder Baustellenname, fremde nicht: ' + tm);
  assert(/Boden 7,65 m²/.test(await sec('Aufmaß')), 'Aufmaß mit Fläche');
  const an = await sec('Angebote');
  assert(/Angebote 1/i.test(an) && /A-2026-004 · Bad EG/.test(an) && /Angenommen/.test(an) && !/A-2026-005/.test(an), 'Angebote nur dieses Kunden');
  assert(/Abschlagsrechnung R-2026-007/.test(await sec('Rechnungen')) && /Gestellt/.test(await sec('Rechnungen')), 'Rechnungen mit Art und Status');
  assert(/Hornbach.*Bauhaus|Bauhaus.*Hornbach/.test(await sec('Kosten')) && /Summe\s*400,00\s€/.test(await sec('Kosten')), 'Kosten aus den Belegen der Baustellen');
  // Eintrag öffnen und zurück
  await page.click('.akrow[data-edit="rechnungen:r1"]'); await page.waitForSelector('#sheetTitle:has-text("R-2026-007")');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('.akstats');
  assert(await page.textContent('#sheetTitle') === 'Petra Meier', 'Rechnung schließen → zurück in die Akte');
  await page.click('.akrow[data-edit="aufmass:b1"]'); await page.waitForSelector('#amBody .pos');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('.akstats');
  assert(true, 'Aufmaß aus der Akte und zurück');
  // + Angebot mit Kundendaten
  await page.click('[data-act="k-new"][data-what="angebot"]'); await page.waitForSelector('#a-name');
  assert(await page.inputValue('#a-name') === 'Petra Meier' && await page.inputValue('#a-email') === 'meier@test.de' && await page.inputValue('#a-ckind') === 'privat', '+ Angebot übernimmt die Kundendaten');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('.akstats');
  // + Termin
  await page.click('[data-act="k-new"][data-what="termin"]'); await page.waitForSelector('#t-title');
  assert(await page.inputValue('#t-place') === 'Lindenweg 2, 18510 Zarrendorf', '+ Termin mit Adresse des Kunden');
  await page.fill('#t-site', 'Terrasse'); await page.click('#form [data-act="save"]'); await page.waitForSelector('.akstats');
  assert(/Termine 3/i.test(await sec('Termine')), 'neuer Termin erscheint gleich in der Akte');
  // + Baustelle
  await page.click('[data-act="k-new"][data-what="baustelle"]'); await page.waitForSelector('#f-title');
  assert(await page.inputValue('#f-party') === 'Petra Meier' && await page.inputValue('#f-kind') === 'kunde', '+ Baustelle für diesen Kunden');
  await page.fill('#f-title', 'Küche'); await page.click('[data-act="save"]'); await page.waitForSelector('.akstats');
  assert(/Baustellen 3/i.test(await sec('Baustellen')), 'neue Baustelle erscheint in der Akte');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  assert(await page.isVisible('#kundenList'), 'Akte schließen → Kundenliste');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
