// Verknüpfungen: Kunde umbenennen zieht Baustellen/Entwürfe mit; Baustelle mit gestellter Rechnung nicht löschbar;
// Löschen erhält Termine (mit Namen) und PDFs; Bestellung „für“ Baustelle → Belege in der Nachkalkulation und Akte;
// gestellte Rechnung → Angebot „Angenommen“; PDF einer Baustelle zuordnen → Kundenakte; Speichern erhält Zusatzfelder.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  const L = k => page.evaluate(k => JSON.parse(localStorage.getItem('belegbuch:' + k) || '[]'), k);
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'FFH', street: 'Kirchstraße 40', city: '18510 Zarrendorf', taxid: '1', iban: 'DE1', bank: 'X', kleinunt: true, _t: 1 }]));
    localStorage.setItem('belegbuch:kunden', JSON.stringify([{ id: 'k1', name: 'Jung', ckind: 'privat', address: 'Weidenring 12, 18442 Negast', email: 'alt@test.de', phone: '', note: '', _t: 1 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', title: 'Gästebad', party: 'Jung', ckind: 'privat', email: 'alt@test.de', address: 'Weidenring 12, 18442 Negast', status: 'Beauftragt', amount: 1000, date: '2026-11-10', example: true, _t: 1 },
      { id: 'b2', kind: 'kunde', title: 'Terrasse', party: 'Jung', ckind: 'privat', status: 'Anfrage', amount: 0, date: '2026-11-15', _t: 1 },
      { id: 'o1', kind: 'lieferant', title: 'Fliesen für Gästebad', party: 'Hornbach', status: 'Bestellt', amount: 0, date: '2026-11-12', _t: 1 }]));
    localStorage.setItem('belegbuch:angebote', JSON.stringify([{ id: 'g1', auftragId: 'b1', nr: 'A-2026-001', name: 'Jung', email: 'alt@test.de', address: 'Weidenring 12, 18442 Negast', date: '2026-11-11', status: 'Versendet', ckind: 'privat', vat: 0, discount: 0, positions: [{ text: 'x', qty: 10, unit: 'm²', price: 50, art: 'lohn' }], _t: 1 },
      { id: 'g2', auftragId: 'b2', nr: 'A-2026-002', name: 'Jung', date: '2026-11-15', status: 'Entwurf', ckind: 'privat', vat: 0, discount: 0, positions: [{ text: 'y', qty: 1, unit: 'm²', price: 5, art: 'lohn' }], _t: 1 }]));
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([{ id: 'r1', auftragId: 'b1', angebotId: 'g1', nr: '', name: 'Jung', email: 'alt@test.de', address: 'Weidenring 12, 18442 Negast', title: 'Gästebad', date: '2026-11-20', servFrom: '2026-11-18', servTo: '2026-11-20', terms: 14, due: '2026-12-04', status: 'Entwurf', ckind: 'privat', vat: 0, discount: 0, intro: '', outro: '', positions: [{ text: 'x', qty: 10, unit: 'm²', price: 50, art: 'lohn' }], _t: 1 }]));
    localStorage.setItem('belegbuch:belege', JSON.stringify([{ id: 'e1', vendor: 'Hornbach', date: '2026-11-12', gross: 238, vat: 19, cat: 'Material', orderId: 'o1', _t: 1 }]));
    localStorage.setItem('belegbuch:termine', JSON.stringify([{ id: 't1', title: 'Besichtigung', date: '2026-12-01', auftragId: 'b2', _t: 1 }]));
    localStorage.setItem('belegbuch:dokumente', JSON.stringify([{ id: 'd1', name: 'Vertrag Jung', date: '2026-11-10', fileId: 'f1', _t: 1 }]));
    localStorage.setItem('belegbuch:ui-fa', JSON.stringify({ kind: 'kunde', open: true }));
  });
  await page.reload(); await page.waitForSelector('.mtile');
  // 1) Bestellung für Baustelle
  await page.click('.mtile[data-tab="auftraege"]'); await page.click('[data-act="fa-kind"][data-kind="lieferant"]');
  await page.click('#auftraegeList article:has-text("Fliesen für Gästebad") .vendor'); await page.waitForSelector('#f-for');
  assert(await page.isVisible('#forWrap'), 'Bestellung: Feld „Für Baustelle“');
  await page.selectOption('#f-for', 'b1'); await page.click('[data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  assert((await L('auftraege')).find(x => x.id === 'o1').forId === 'b1', 'Bestellung mit Baustelle verknüpft');
  await page.click('[data-act="fa-kind"][data-kind="kunde"]');
  assert(/Rohertrag 762,00\s€/.test(await page.textContent('#auftraegeList article:has-text("Gästebad")')), 'Beleg der Bestellung (238 €) zählt in der Nachkalkulation der Baustelle: Rohertrag 762 €');
  // 2) Bearbeiten erhält Zusatzfelder
  await page.click('#auftraegeList article:has-text("Gästebad") .vendor'); await page.waitForSelector('#f-title'); await page.click('[data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  assert((await L('auftraege')).find(x => x.id === 'b1').example === true, 'Speichern der Baustelle erhält Felder, die das Formular nicht zeigt');
  // 3) PDF zuordnen
  await page.click('#backBtn'); await page.click('.mtile[data-tab="ordner"]'); await page.selectOption('[data-docsite="d1"]', 'b1'); await page.waitForTimeout(200);
  assert((await L('dokumente'))[0].auftragId === 'b1', 'PDF der Baustelle zugeordnet');
  // 4) Kunde umbenennen
  await page.click('#backBtn'); await page.click('.mtile[data-tab="kunden"]'); await page.click('#kundenList article:has-text("Jung")'); await page.waitForSelector('.akstats');
  const akte = await page.textContent('#sheetBody');
  assert(/Vertrag Jung/.test(akte) && /Hornbach/.test(akte), 'Kundenakte zeigt das PDF und den Beleg der Bestellung');
  await page.click('[data-act="k-edit"]'); await page.waitForSelector('#k-name');
  await page.fill('#k-name', 'Simone Jung'); await page.fill('#k-email', 'neu@test.de'); await page.click('[data-act="save"]'); await page.waitForSelector('.akstats');
  const au = await L('auftraege'), an = await L('angebote'), re = await L('rechnungen');
  assert(au.filter(x => x.kind === 'kunde').every(x => x.party === 'Simone Jung') && au.find(x => x.id === 'b1').email === 'neu@test.de', 'Umbenennen: Baustellen haben den neuen Namen und die neue E-Mail');
  assert(an.find(x => x.id === 'g2').name === 'Simone Jung' && an.find(x => x.id === 'g1').name === 'Jung' && re[0].name === 'Simone Jung' && re[0].email === 'neu@test.de', 'Entwürfe aktualisiert, versendetes Angebot unverändert');
  assert(/Baustellen\s*2/.test(await page.textContent('.akstats')), 'Kundenakte zeigt nach dem Umbenennen weiter beide Baustellen');
  await page.click('[data-act="cancel"]');
  // 5) Rechnung stellen → Angebot angenommen
  await page.click('#backBtn'); await page.click('.mtile[data-tab="rechnungen"]'); await page.click('#rechnungenList .row .vendor'); await page.waitForSelector('[data-act="re-issue"]');
  await page.click('[data-act="re-issue"]'); await page.click('[data-act="re-issue"]'); await page.waitForFunction(() => /Gestellt/.test(document.querySelector('#sheetTitle').textContent));
  assert((await L('angebote')).find(x => x.id === 'g1').status === 'Angenommen', 'gestellte Rechnung: zugehöriges Angebot „Angenommen“');
  await page.click('[data-act="cancel"]');
  // 6) Löschen
  await page.click('#backBtn'); await page.click('.mtile[data-tab="auftraege"]');
  await page.click('#auftraegeList article:has-text("Gästebad") .vendor'); await page.waitForSelector('[data-act="delete"]'); await page.click('[data-act="delete"]');
  assert(/gestellte Rechnung/.test(await page.textContent('#formErr')) && (await L('auftraege')).some(x => x.id === 'b1'), 'Baustelle mit gestellter Rechnung lässt sich nicht löschen');
  await page.click('[data-act="cancel"]');
  await page.click('#auftraegeList article:has-text("Terrasse") .vendor'); await page.waitForSelector('[data-act="delete"]'); await page.click('[data-act="delete"]');
  assert(/Mit 1 Angebot/.test(await page.textContent('[data-act="delete"]')), 'Rückfrage nennt, was mitgelöscht wird');
  await page.click('[data-act="delete"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  const tm = (await L('termine'))[0];
  assert(tm && tm.auftragId === '' && tm.baustelle === 'Terrasse', 'Termin bleibt, mit dem Namen der gelöschten Baustelle');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
