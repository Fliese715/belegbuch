// Aufmaß-Bereiche: Positionen der Preisliste stehen gruppiert in der Auswahl (Abdichtung Boden/Wand, Dichtband,
// Dichtecken, Manschetten …); eigene Bereiche nur für Zusätzliches; Summen, Materialbedarf, Angebot mit Preislisten-Text
// und -Preis; Löschen eigener Bereiche nur wenn unbenutzt; vorhandener eigener Bereich gleichen Namens bleibt.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => { localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Bad EG Meier', party: 'Meier', ckind: 'privat', status: 'Beauftragt', amount: 0, _t: 1 }])); localStorage.setItem('belegbuch:ui-fa', JSON.stringify({ kind: 'kunde', open: true })); });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="auftraege"]');
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  const f = (i, k, v) => page.fill(`#amBody .pos[data-i="${i}"] [data-f="${k}"]`, v);
  const groups = await page.$$eval('#amBody .pos[data-i="0"] [data-f="type"] optgroup', e => e.map(x => x.label + ':' + x.children.length));
  assert(groups[0] === 'Fliesen:4' && groups.some(x => x === 'Abdichtung:7') && groups.some(x => /^Dusche & Bad:2$/.test(x)), 'Bereiche gruppiert: ' + groups.join(' '));
  await f(0, 'room', 'Bad'); await f(0, 'l', '2,45+1,8'); await f(0, 'b', '1,8');
  const add = async (i, type) => { await page.click('[data-act="am-add"]'); await page.selectOption(`#amBody .pos[data-i="${i}"] [data-f="type"]`, type); };
  await add(1, 'k-abd-boden'); await f(1, 'l', '2,45+1,8'); await f(1, 'b', '1,8');
  await add(2, 'k-abd-wand');
  assert(/Höhe/.test(await page.textContent('#amBody .pos[data-i="2"] .am-b')), '„Abdichtung Wand“ fragt nach der Höhe');
  await f(2, 'l', '2,45+1,8+2,45+1,8'); await f(2, 'b', '0,3'); await f(2, 'abz', '0,885x0,3');
  await add(3, 'k-dichtband'); await f(3, 'l', '8,5+2'); await f(3, 'abz', '0,885');
  await add(4, 'k-ecke-innen');
  assert(await page.isHidden('#amBody .pos[data-i="4"] [data-f="l"]'), 'Dichtecke innen in Stück: nur Anzahl');
  await f(4, 'n', '4');
  await add(5, 'k-mans-boden'); await f(5, 'n', '1');
  const room = (await page.textContent('.amroom')).replace(/\s+/g, ' ');
  assert(/Boden 7,65 m² · Abdichtung Boden 7,65 m² · Abdichtung Wand 2,28 m² · Dichtband 9,62 lfm · Dichtecke innen 4 Stk · Manschette Boden 1 Stk/.test(room), 'Summe je Raum: ' + room);
  assert(/Fläche gesamt\s*7,65 m²/.test(await page.textContent('#amSum')), 'Abdichtung zählt nicht zur Fliesenfläche');
  assert(/aus dem Aufmaß: 9,93/.test(await page.getAttribute('#am-abd', 'placeholder')), 'Abdichtungsfläche aus dem Aufmaß für den Materialbedarf');
  // eigener Bereich für Zusätzliches
  await page.click('[data-act="am-add"]'); await page.selectOption('#amBody .pos[data-i="6"] [data-f="type"]', '__new');
  assert(await page.$eval('#amTypes', d => d.open), '„+ Eigener Bereich …“ öffnet die Verwaltung');
  assert(!(await page.$('#amTypes [data-act="am-type-add"][data-name="Dichtband"]')), 'keine Schnellknöpfe für Bereiche, die schon in der Liste stehen');
  await page.fill('#am-tname', 'Fensterbank Marmor'); await page.selectOption('#am-tunit', 'lfm'); await page.click('.amt-new [data-act="am-type-add"]'); await page.waitForTimeout(200);
  assert(await page.$eval('#amBody .pos[data-i="6"] [data-f="type"]', s => s.options[s.selectedIndex].text) === 'Fensterbank Marmor (lfm)', 'eigener Bereich angelegt und eingesetzt');
  await f(6, 'l', '1,2');
  await page.click('[data-act="am-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Angebot
  await page.click('#auftraegeList [data-act="angebot"]'); await page.waitForSelector('.ampanel');
  const p = await page.$$eval('#angBody .pos', e => e.map(x => x.querySelector('textarea').value.split(' (')[0] + ' = ' + x.querySelector('[data-pf="qty"]').value + ' ' + x.querySelector('[data-pf="unit"]').value + ' @ ' + x.querySelector('[data-pf="price"]').value));
  const txt = p.join(' | ');
  assert(/Bad: Verbundabdichtung im Nassbereich – Boden = 7,65 m² @ 27,50/.test(txt) && /Bad: Verbundabdichtung im Nassbereich – Wand = 2,28 m²/.test(txt) && /Bad: Dichtband in Ecken und Anschlüssen einbetten = 9,62 lfm @ 6,00/.test(txt) &&
    /Bad: Dichtband-Innenecke einbauen = 4 Stk @ 7,50/.test(txt) && /Bad: Dichtmanschette Boden \(Bodenablauf\) einbauen|Bad: Dichtmanschette Boden = 1 Stk/.test(txt) && /Bad: Fensterbank Marmor = 1,2 lfm @ 35,00/.test(txt), 'Angebot mit Preislisten-Texten und -Preisen: ' + txt);
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Löschen eigener Bereiche
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  await page.$eval('#amTypes', d => { d.open = true; });
  await page.click('.amt:has-text("Fensterbank Marmor") button');
  assert(/noch in einem Aufmaß/.test(await page.textContent('#toast')), 'benutzter eigener Bereich lässt sich nicht löschen');
  // vorhandener eigener Bereich gleichen Namens verdrängt den eingebauten
  await page.click('[data-act="cancel"]');
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('belegbuch:settings') || '[]'); const a = st.find(x => x.id === 'aufmass'); a.types.push({ id: 'xalt', name: 'Abdichtung Wand', unit: 'm²', katId: 'abdichtung' }); localStorage.setItem('belegbuch:settings', JSON.stringify(st)); });
  await page.reload(); await page.waitForSelector('#auftraegeList'); await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  const names = await page.$$eval('#amBody .pos[data-i="0"] [data-f="type"] option', e => e.filter(x => /^Abdichtung Wand/.test(x.textContent)).map(x => x.value));
  assert(names.length === 1 && names[0] === 'xalt', 'gleicher Name nur einmal, der eigene bleibt: ' + names.join(','));
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
