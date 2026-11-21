// Eigene Aufmaß-Bereiche: Schnell anlegen (Abdichtung Boden/Wand), eigener Name mit Einheit Stück,
// Einsetzen in die Zeile, Summen, Abdichtungsfläche für den Materialbedarf, Angebot, Löschen nur wenn unbenutzt.
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
  const typeText = i => page.$eval(`#amBody .pos[data-i="${i}"] [data-f="type"]`, s => s.options[s.selectedIndex].text);
  await f(0, 'room', 'Bad'); await f(0, 'l', '2,45+1,8'); await f(0, 'b', '1,8');
  await page.click('[data-act="am-add"]'); await page.selectOption('#amBody .pos[data-i="1"] [data-f="type"]', '__new');
  assert(await page.$eval('#amTypes', d => d.open) && /Zeile 2/.test(await page.textContent('#amTypes')), '„+ Eigener Bereich …“ öffnet die Verwaltung für Zeile 2');
  await page.click('[data-act="am-type-add"][data-name="Abdichtung Boden"]'); await page.waitForTimeout(200);
  assert(await typeText(1) === 'Abdichtung Boden', 'Schnell angelegt und in die Zeile eingesetzt');
  await f(1, 'l', '2,45+1,8'); await f(1, 'b', '1,8');
  await page.click('[data-act="am-add"]'); await page.selectOption('#amBody .pos[data-i="2"] [data-f="type"]', '__new');
  await page.click('[data-act="am-type-add"][data-name="Abdichtung Wand"]'); await page.waitForTimeout(200);
  assert(/Höhe/.test(await page.textContent('#amBody .pos[data-i="2"] .am-b')), '„Abdichtung Wand“ fragt nach der Höhe');
  await f(2, 'l', '2,45+1,8+2,45+1,8'); await f(2, 'b', '0,3'); await f(2, 'abz', '0,885x0,3');
  await page.click('[data-act="am-add"]'); await page.selectOption('#amBody .pos[data-i="3"] [data-f="type"]', '__new');
  await page.fill('#am-tname', 'Bodenablauf'); await page.selectOption('#am-tunit', 'Stk'); await page.click('.amt-new [data-act="am-type-add"]'); await page.waitForTimeout(200);
  assert(await typeText(3) === 'Bodenablauf' && await page.isHidden('#amBody .pos[data-i="3"] [data-f="l"]'), 'eigener Bereich „Bodenablauf“ in Stück: nur Anzahl');
  await f(3, 'n', '1');
  const room = (await page.textContent('.amroom')).replace(/\s+/g, ' ');
  assert(/Boden 7,65 m² · Abdichtung Boden 7,65 m² · Abdichtung Wand 2,28 m² · Bodenablauf 1 Stk/.test(room), 'Summe je Raum: ' + room);
  assert(/Fläche gesamt\s*7,65 m²/.test(await page.textContent('#amSum')), 'Abdichtung zählt nicht zur Fliesenfläche');
  assert(/aus dem Aufmaß: 9,93/.test(await page.getAttribute('#am-abd', 'placeholder')) && /Abdichtung \(1,2 kg\/m²\)2 × 7 kg Eimer11,92 kg/.test(await page.textContent('#matBox')), 'Abdichtungsfläche aus dem Aufmaß für den Materialbedarf');
  await page.click('[data-act="am-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Angebot
  await page.click('#auftraegeList [data-act="angebot"]'); await page.waitForSelector('.ampanel');
  const p = await page.$$eval('#angBody .pos', e => e.map(x => x.querySelector('textarea').value.split(' (')[0] + ' = ' + x.querySelector('[data-pf="qty"]').value + ' ' + x.querySelector('[data-pf="unit"]').value));
  assert(p.join(' | ') === 'Bad: Bodenfliesen verlegen und verfugen = 7,65 m² | Bad: Abdichtung Boden = 7,65 m² | Bad: Abdichtung Wand = 2,28 m² | Bad: Bodenablauf = 1 Stk', 'Angebot: ' + p.join(' | '));
  const pr = await page.$$eval('#angBody .pos [data-pf="price"]', e => e.map(x => x.value));
  assert(pr[1] !== '0,00' && pr[2] !== '0,00' && pr[3] === '0,00', 'Abdichtung mit Preis aus der Preisliste, Bodenablauf ohne Preis: ' + pr.join('|'));
  await page.click('[data-act="cancel"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Löschen
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  await page.$eval('#amTypes', d => { d.open = true; });
  const before = await page.$$eval('.amt', e => e.length);
  await page.click('.amt:has-text("Bodenablauf") button');
  assert(/noch in einem Aufmaß/.test(await page.textContent('#toast')) && (await page.$$eval('.amt', e => e.length)) === before, 'benutzter Bereich lässt sich nicht löschen');
  await page.click('#amBody .pos[data-i="3"] [data-act="am-del"]');
  await page.click('[data-act="am-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  await page.$eval('#amTypes', d => { d.open = true; });
  await page.click('.amt:has-text("Bodenablauf") button'); await page.waitForTimeout(200);
  assert(!(await page.textContent('#amTypes')).includes('Bodenablauf Stk'), 'unbenutzter Bereich gelöscht');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
