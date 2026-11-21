// Aufmaß → Angebot: automatisch je Raum (Boden/Wand getrennt), Umstellen auf „Zusammengefasst“ (Preise bleiben),
// geändertes Aufmaß → „Mengen aktualisieren“ ohne doppelte Positionen, Rechnung übernimmt Mengen je Raum.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Bad EG Meier', party: 'Meier', ckind: 'privat', site: 'Lindenweg 2', status: 'Beauftragt', amount: 0, _t: 1,
      aufmass: { date: '2026-11-21', waste: 10, rows: [{ room: 'Bad', type: 'boden', l: '2,45+1,80', b: '1,80', n: '1', abz: '' }, { room: 'Bad', type: 'wand', l: '2,45+1,80+2,45+1,80', b: '2,5', n: '1', abz: '0,885x2,01' }, { room: 'Flur', type: 'boden', l: '4,2', b: '1,1', n: '1', abz: '' }, { room: 'Flur', type: 'sockel', l: '(4,2+1,1)x2', b: '', n: '1', abz: '0,885;0,76' }] } }]));
    localStorage.setItem('belegbuch:ui-fa', JSON.stringify({ kind: 'aufmass', open: true }));
  });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="auftraege"]');
  await page.click('#auftraegeList [data-act="angebot"]'); await page.waitForSelector('.ampanel');
  const pos = () => page.$$eval('#angBody .pos', e => e.map(x => x.querySelector('textarea').value.split(' (')[0] + ' = ' + x.querySelector('[data-pf="qty"]').value + ' @ ' + x.querySelector('[data-pf="price"]').value));
  let p = await pos();
  assert(p.length === 4 && /^Bad: Bodenfliesen.* = 7,65/.test(p[0]) && /^Bad: Wandfliesen.* = 19,47/.test(p[1]) && /^Flur: Bodenfliesen.* = 4,62/.test(p[2]) && /^Flur: Fliesensockel.* = 8,96/.test(p[3]), 'automatisch je Raum, Boden und Wand getrennt: ' + p.join(' | '));
  assert(/Mengen sind aktuell/.test(await page.textContent('.ampanel [data-act="ang-am"]')), 'Kasten zeigt „Mengen sind aktuell“');
  await page.fill('#angBody .pos[data-i="1"] [data-pf="price"]', '62');
  await page.click('[data-act="ang-am-mode"][data-mode="summe"]');
  assert(/Zusammengefasst/.test(await page.textContent('.ampanel [data-act="ang-am"]')) && (await pos()).length === 4, 'Art wählen ändert noch nichts, Knopf „umstellen“');
  await page.click('.ampanel [data-act="ang-am"]');
  p = await pos();
  assert(p.length === 3 && /^Bodenfliesen.* = 12,27/.test(p[0]) && /^Wandfliesen.* = 19,47 @ 62,00/.test(p[1]) && /^Fliesensockel.* = 8,96/.test(p[2]), 'zusammengefasst, eigener Wandpreis bleibt: ' + p.join(' | '));
  await page.click('[data-act="ang-am-mode"][data-mode="raum"]'); await page.click('.ampanel [data-act="ang-am"]');
  await page.click('[data-act="ang-free"]'); await page.fill('#angBody .pos[data-i="4"] [data-pf="text"]', 'Anfahrt'); await page.fill('#angBody .pos[data-i="4"] [data-pf="price"]', '35');
  await page.click('[data-act="ang-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Aufmaß ändern: Bad-Wand höher, neuer Raum Küche
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  await page.fill('#amBody .pos[data-i="1"] [data-f="b"]', '2,6');
  await page.click('[data-act="am-room"]'); await page.fill('#amBody .pos[data-i="4"] [data-f="room"]', 'Küche'); await page.selectOption('#amBody .pos[data-i="4"] [data-f="type"]', 'wand');
  await page.fill('#amBody .pos[data-i="4"] [data-f="l"]', '3'); await page.fill('#amBody .pos[data-i="4"] [data-f="b"]', '0,6');
  await page.click('[data-act="am-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.click('#auftraegeList [data-act="angebot"]'); await page.waitForSelector('.ampanel');
  assert(/Mengen aktualisieren/.test(await page.textContent('.ampanel [data-act="ang-am"]')) && /geändert/.test(await page.textContent('.ampanel')), 'geändertes Aufmaß wird erkannt');
  await page.click('.ampanel [data-act="ang-am"]');
  p = await pos();
  assert(p.length === 6 && /^Bad: Wandfliesen.* = 20,32 @ 62,00/.test(p[1]) && /^Küche: Wandfliesen.* = 1,8 @ 62,00/.test(p[4]) && /^Anfahrt = 1 @ 35,00/.test(p[5]), 'Mengen aktualisiert, Küche ergänzt, Preise und freie Position bleiben: ' + p.join(' | '));
  assert(/Mengen sind aktuell/.test(await page.textContent('.ampanel [data-act="ang-am"]')), 'danach wieder aktuell');
  await page.click('[data-act="ang-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Rechnung: Bad-Wand nochmal größer → Menge je Raum, nicht die Gesamtfläche
  await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('belegbuch:auftraege')); a[0].aufmass.rows[1].b = '2,7'; localStorage.setItem('belegbuch:auftraege', JSON.stringify(a)); });
  await page.reload(); await page.waitForSelector('#auftraegeList');
  await page.click('[data-act="fa-kind"][data-kind="kunde"]'); await page.click('#auftraegeList [data-act="rechnung"]'); await page.waitForSelector('#reBody .pos, #angBody .pos');
  const rq = await page.$$eval('.pos', e => e.map(x => x.querySelector('[data-pf="qty"]').value));
  assert(rq.slice(0, 5).join('|') === '7,65|21,17|4,62|8,96|1,8', 'Rechnung: Mengen je Raum aus dem Aufmaß: ' + rq.join('|'));
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
