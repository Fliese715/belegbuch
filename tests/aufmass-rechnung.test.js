// Aufmaß → Rechnung: ohne Angebot neue Rechnung mit Positionen aus dem Aufmaß (Preisliste); offener Entwurf bekommt geänderte Mengen.
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
      aufmass: { date: '2026-11-21', waste: 10, rows: [{ room: 'Bad', type: 'boden', l: '2,45+1,80', b: '1,80', n: '1', abz: '' }, { room: 'Bad', type: 'wand', l: '4', b: '2,5', n: '1', abz: '' }] } }]));
  });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-act="menu-aufmass"]');
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  assert(await page.isVisible('[data-act="am-rechnung"]'), 'Aufmaß hat „In Rechnung übernehmen“');
  await page.click('[data-act="am-rechnung"]'); await page.waitForSelector('#angBody .pos');
  const pos = () => page.$$eval('#angBody .pos', e => e.map(x => x.querySelector('textarea').value.split(' (')[0] + ' = ' + x.querySelector('[data-pf="qty"]').value));
  let p = await pos();
  assert(/Rechnung/.test(await page.textContent('#sheetTitle')) && p.some(x => /^Bad: Bodenfliesen.* = 7,65/.test(x)) && p.some(x => /^Bad: Wandfliesen.* = 10/.test(x)), 'neue Rechnung mit Mengen aus dem Aufmaß: ' + p.join(' | '));
  await page.click('[data-act="re-save"]'); await page.waitForTimeout(300); await page.click('[data-act="cancel"]').catch(() => {}); await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.click('.mtile[data-act="menu-aufmass"]').catch(() => {});
  await page.goto(APP + '#auftraege'); await page.waitForSelector('#auftraegeList [data-act="aufmass"]');
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  await page.fill('#amBody .pos[data-i="0"] [data-f="b"]', '2');
  await page.click('[data-act="am-rechnung"]'); await page.waitForSelector('#angBody .pos');
  p = await pos();
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:rechnungen')).length);
  assert(n === 1 && p.some(x => /^Bad: Bodenfliesen.* = 8,5/.test(x)) && p.filter(x => /Bodenfliesen/.test(x)).length === 1, 'Entwurf bekommt die neue Menge, keine zweite Rechnung: ' + p.join(' | '));
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
