// Rechnung ← Angebot: neue Rechnung übernimmt Preise; ältere Rechnung (vor dem Angebot angelegt) holt Kunde,
// Positionen und Preise per Knopf nach; geänderte Angebotspreise lassen sich nachziehen; Kleinunternehmer-Warnung.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  const ang = { id: 'g1', auftragId: 'b1', nr: 'A-2026-001', name: 'Simone Jung', email: 'jung@test.de', address: 'Weidenring 12, 18442 Negast', site: 'Weidenring 12, 18442 Negast', title: 'Fliesenarbeiten Weidenring 12', date: '2026-11-21', status: 'Entwurf', ckind: 'privat', region: '', vat: 0, discount: 0, _t: 1,
    positions: [{ amKey: 'bad|boden', katId: 'verl-std', art: 'lohn', text: 'Bad: Bodenfliesen verlegen', unit: 'm²', qty: 2.52, price: 48.5 }, { amKey: 'bad|k-ecke-innen', katId: 'dichtecke-innen', art: 'lohn', text: 'Bad: Dichtband-Innenecke einbauen', unit: 'Stk', qty: 4, price: 7.5 }, { katId: 'grundierung', art: 'lohn', text: 'Untergrund grundieren', unit: 'm²', qty: 11.39, price: 6.5 }] };
  await page.evaluate(a => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'FFH', street: 'Kirchstraße 40', city: '18510 Zarrendorf', kleinunt: true, _t: 1 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Gästebad', party: 'Simone Jung', ckind: 'privat', status: 'Beauftragt', amount: 0, _t: 1, aufmass: { date: '2026-11-21', rows: [{ room: 'Bad', type: 'boden', l: '1,8', b: '1,5', n: '1', abz: '' }, { room: 'Bad', type: 'k-ecke-innen', l: '', b: '', n: '4', abz: '' }] } }]));
    localStorage.setItem('belegbuch:angebote', JSON.stringify([a]));
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([{ id: 'r1', auftragId: 'b1', angebotId: '', nr: '', name: 'Mustermann', address: 'Musterstraße 123 08156 Musterstadt', site: 'Musterstraße 123', title: 'Fliesenarbeiten Testbaustelle', date: '2026-11-13', status: 'Entwurf', ckind: 'privat', vat: 19, discount: 0, intro: '', outro: '', _t: 1,
      positions: [{ art: 'lohn', katId: 'verl-std', price: 48.5, qty: 8.25, text: 'Fliesen verlegen und verfugen', unit: 'm²' }, { art: 'material', katId: 'verl-std', price: 48.5, qty: 8.25, text: 'Fliesen verlegen und verfugen', unit: 'm²' }] }]));
    localStorage.setItem('belegbuch:ui-fa', JSON.stringify({ kind: 'kunde', open: true }));
  }, ang);
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="rechnungen"]');
  await page.click('#rechnungenList .row .vendor'); await page.waitForSelector('#angBody .ampanel');
  assert(/Aus dem Angebot A-2026-001/.test(await page.textContent('.ampanel')) && /ohne dieses Angebot angelegt/.test(await page.textContent('.ampanel')) && /Mustermann/.test(await page.textContent('.ampanel')), 'alte Rechnung: Kasten „Aus dem Angebot“ erklärt den Unterschied');
  assert(await page.isVisible('#kleinWarn'), 'Kleinunternehmer mit 19 % in der Rechnung: Warnung');
  await page.click('[data-act="re-fromang-all"]');
  const pos = await page.$$eval('#angBody .pos', e => e.map(x => x.querySelector('textarea').value + ' = ' + x.querySelector('[data-pf="qty"]').value + ' @ ' + x.querySelector('[data-pf="price"]').value));
  assert(pos.join(' | ') === 'Bad: Bodenfliesen verlegen = 2,7 @ 48,50 | Bad: Dichtband-Innenecke einbauen = 4 @ 7,50 | Untergrund grundieren = 2,7 @ 6,50', 'Positionen und Preise aus dem Angebot, Mengen aus dem Aufmaß: ' + pos.join(' | '));
  assert(await page.inputValue('#r-name') === 'Simone Jung' && await page.inputValue('#r-address') === 'Weidenring 12, 18442 Negast' && await page.inputValue('#a-vat') === '0' && await page.isHidden('#kleinWarn'), 'Kunde, Adresse und 0 % USt aus dem Angebot');
  assert(/Preise wie im Angebot/.test(await page.textContent('.ampanel')), 'danach: Preise wie im Angebot');
  await page.click('[data-act="re-save"]'); await page.waitForTimeout(300); await page.click('[data-act="cancel"]').catch(() => {});
  // Angebot ändert sich: Preis + neue Position
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('belegbuch:angebote')); g[0].positions[1].price = 8; g[0].positions.push({ katId: 'profil', art: 'lohn', text: 'Fliesenschiene setzen', unit: 'lfm', qty: 1.2, price: 7.5 }); localStorage.setItem('belegbuch:angebote', JSON.stringify(g)); });
  await page.reload(); await page.waitForSelector('#rechnungenList .row'); await page.click('#rechnungenList .row .vendor'); await page.waitForSelector('#angBody .ampanel');
  assert(/geändert/.test(await page.textContent('.ampanel')), 'geändertes Angebot erkannt');
  await page.click('[data-act="re-fromang-prices"]');
  const p2 = await page.$$eval('#angBody .pos', e => e.map(x => x.querySelector('textarea').value + ' @ ' + x.querySelector('[data-pf="price"]').value));
  assert(p2.length === 4 && /Innenecke einbauen @ 8,00/.test(p2[1]) && /Fliesenschiene setzen @ 7,50/.test(p2[3]), 'neuer Preis und neue Position übernommen: ' + p2.join(' | '));
  await page.click('[data-act="cancel"]').catch(() => {});
  // Neue Rechnung aus der Baustelle: Preise direkt aus dem Angebot
  await page.evaluate(() => localStorage.setItem('belegbuch:rechnungen', '[]'));
  await page.reload(); await page.waitForSelector('#backBtn'); await page.click('#backBtn'); await page.click('.mtile[data-tab="auftraege"]');
  await page.click('#auftraegeList [data-act="rechnung"]'); await page.waitForSelector('#angBody .pos');
  const p3 = await page.$$eval('#angBody .pos [data-pf="price"]', e => e.map(x => x.value));
  assert(p3.join('|') === '48,50|8,00|6,50|7,50' && /Preise wie im Angebot/.test(await page.textContent('.ampanel')), 'neue Rechnung: Preise aus dem Angebot');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
