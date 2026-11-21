const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// Navigation über das Startmenü: erst zurück ins Menü, dann die Kachel antippen.
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
// Kundenkartei (anlegen, übernehmen, Daten in Aufträge vorschlagen) und Materialrechner im Aufmaß.
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', kleinunt: true }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', ckind: 'privat', title: 'Bad EG', party: 'Meier', address: 'Lindenweg 12, 18439 Stralsund', email: 'meier@example.org', amount: 1000, status: 'In Arbeit', date: '2026-02-01', due: '2026-12-31', terms: 14,
        aufmass: { rows: [{ room: 'Bad', type: 'boden', l: '5', b: '2', n: '1', abz: '' }, { room: 'Bad', type: 'wand', l: '10', b: '2', n: '1', abz: '' }, { room: 'Bad', type: 'silikon', l: '25', n: '1', abz: '' }], waste: 10 } },
      { id: 'b2', kind: 'kunde', ckind: 'firma', title: 'Flur', party: 'Bau GmbH', amount: 500, status: 'Anfrage', date: '2026-03-01', due: '2026-12-31', terms: 14 }]));
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([{ id: 'r1', auftragId: 'b1', nr: 'R-2026-001', status: 'Gestellt', date: '2026-03-01', due: '2026-03-15', vat: 0, positions: [{ text: 'X', qty: 1, unit: 'psch', price: 1200 }] }]));
  });
  await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  // Kunden
  await nav(page, 'kunden');
  assert(/2 Kunden aus Aufträgen übernehmen/.test(await page.textContent('#kImport')) && /Noch keine Kunden/.test(await page.textContent('#kundenList')), 'leere Kartei, Angebot zum Übernehmen');
  await page.click('#kImport'); await page.waitForTimeout(300);
  const meier = () => page.textContent('#kundenList article:has-text("Meier")');
  assert(/Lindenweg 12/.test(await meier()) && /1\.200,00/.test(await meier()) && /offen 1\.200,00/.test(await meier()) && /Privatkunde/.test(await meier()), 'Meier übernommen mit Adresse, Umsatz und offenem Betrag');
  assert(await page.$eval('#kImport', x => x.hidden), 'nach dem Übernehmen kein Knopf mehr');
  await page.fill('#kq', 'bau'); assert((await page.$$('#kundenList article')).length === 1, 'Suche findet Bau GmbH');
  await page.fill('#kq', '');
  assert((await page.textContent('#fab')).trim() === '+ Kunde', 'Knopf heißt „+ Kunde“');
  await page.click('#fab'); await page.fill('#k-name', 'meier'); await page.click('[data-act="save"]');
  assert(/gibt es schon/.test(await page.textContent('#formErr')), 'doppelter Kunde wird abgelehnt');
  await page.fill('#k-name', 'Schulz'); await page.fill('#k-addr', 'Hafenstraße 3, 18439 Stralsund'); await page.fill('#k-phone', '03831 123'); await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  await page.click('#kundenList article:has-text("Meier") .vendor'); await page.waitForSelector('.akstats');
  assert(/Bad EG/.test(await page.textContent('#sheet')), 'Kundenakte zeigt die Baustellen');
  await page.click('[data-act="k-edit"]'); await page.waitForSelector('#k-name');
  await page.click('[data-act="cancel"]'); await page.waitForSelector('.akstats');
  assert(true, 'Bearbeiten → Abbrechen führt zurück in die Akte'); await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Auftrag: Kundendaten vorschlagen, neuer Kunde wird angelegt
  await nav(page, 'auftraege'); await page.click('#fab'); await page.fill('#f-title', 'Küche'); await page.fill('#f-party', 'Schulz'); await page.press('#f-party', 'Tab');
  assert(await page.inputValue('#f-addr') === 'Hafenstraße 3, 18439 Stralsund' && await page.inputValue('#f-ckind') === 'privat', 'Auftrag übernimmt Adresse und Kundenart von Schulz');
  await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  await page.click('#fab'); await page.fill('#f-title', 'Terrasse'); await page.fill('#f-party', 'Neumann'); await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:kunden')).map(k => k.name).sort().join(',')) === 'Bau GmbH,Meier,Neumann,Schulz', 'neuer Kunde Neumann automatisch angelegt');
  // Materialrechner: Boden 10, Wand 20 → 30 m², 10 % Verschnitt
  await page.click('#auftraegeList article:has-text("Bad EG") [data-act="aufmass"]'); await page.waitForSelector('#matBox');
  let m = (await page.textContent('#matBox')).replace(/\s+/g, ' ');
  assert(/Bodenfliesen inkl\. 10 % Verschnitt\s*11 m²/.test(m) && /Wandfliesen.*22 m²/.test(m), 'Fliesen mit Verschnitt: 11 und 22 m²');
  assert(/Fliesenkleber.*5 × 25 kg Sack\s*105 kg/.test(m) && /Fugenmörtel.*3 × 5 kg Sack\s*15 kg/.test(m) && /Grundierung.*1 × 5 l Kanister\s*4,5 l/.test(m) && /Silikon.*3 × 310 ml Kartusche\s*25 lfm/.test(m), 'Kleber 105 kg = 5 Sack, Fuge 15 kg = 3 Sack, Grundierung 1 Kanister, Silikon 3 Kartuschen');
  assert(!/Abdichtung/.test(m), 'ohne Abdichtungsfläche keine Abdichtung');
  await page.fill('#am-abd', '6'); m = (await page.textContent('#matBox')).replace(/\s+/g, ' ');
  assert(/Abdichtung.*2 × 7 kg Eimer\s*7,2 kg/.test(m), 'Abdichtung 6 m² = 7,2 kg = 2 Eimer');
  await page.click('[data-act="mat-order"]'); await page.waitForTimeout(300);
  const o = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege')).find(a => a.kind === 'lieferant'));
  assert(o && o.title === 'Material für Bad EG' && /Fliesenkleber/.test(o.note), 'Bestellung „Material für Bad EG“ mit Liste angelegt');
  await page.click('[data-act="am-save"]'); await page.waitForTimeout(300);
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege')).find(a => a.id === 'b1').aufmass.abd) === 6, 'Abdichtungsfläche wird mit dem Aufmaß gespeichert');
  // Verbrauchswert ändern
  await nav(page, 'settings'); await page.fill('#s-mkleber', '4'); await page.click('[data-act="set-save"]'); await page.waitForTimeout(300);
  await nav(page, 'auftraege'); await page.click('#auftraegeList article:has-text("Bad EG") [data-act="aufmass"]'); await page.waitForSelector('#matBox');
  assert(/Fliesenkleber \(4 kg\/m²\)\s*5 × 25 kg Sack\s*120 kg/.test((await page.textContent('#matBox')).replace(/\s+/g, ' ')), 'eigener Kleberverbrauch 4 kg/m² wirkt');
  console.log('Fehler: ' + (errs.join('|') || 'keine')); await b.close();
})();
