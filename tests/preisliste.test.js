// Preisliste: Gruppen, neue Positionen (Dichtband, Dichtecken, Manschetten …), Schätzwerte markiert,
// Auswahl im Angebot mit Gruppen, Aufmaß-Bereich „Dichtecke innen“ bekommt im Angebot den Preislisten-Preis.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.click('.mtile[data-act="settings"]'); await page.waitForSelector('.catg');
  const g = await page.$$eval('.catg', e => e.map(x => x.textContent));
  assert(g.join('|') === 'Verlegen|Zuschläge|Untergrund & Abbruch|Abdichtung|Profile & Zuschnitt|Dusche & Bad|Sonstiges', 'Gruppen in Firma & Einstellungen');
  for (const id of ['dichtband', 'dichtecke-innen', 'dichtecke-aussen', 'manschette-wand', 'manschette-boden', 'entkopplung', 'profil', 'gehrung', 'bohrung', 'treppe', 'fensterbank', 'bodenablauf', 'duschrinne', 'grundierung', 'verfugen'])
    if (!(await page.$('#p-' + id))) assert(false, 'Position fehlt: ' + id);
  assert(true, '15 neue Positionen mit Preisfeldern');
  const est = await page.$$eval('.prow', e => e.filter(x => /Schätzwert/.test(x.textContent)).map(x => x.querySelector('.ptext div').textContent));
  assert(est.length === 8 && est.some(t => /Innenecke/.test(t)) && !est.some(t => /Dichtband in Ecken/.test(t)), 'Schätzwerte markiert: ' + est.length);
  await page.fill('#p-dichtecke-innen', '8,50'); await page.click('[data-act="set-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Angebot: Auswahl gruppiert
  await page.click('#backBtn').catch(() => {}); await page.click('.mtile[data-tab="rechnungen"]'); await page.click('#v-rechnungen .seg [data-tab="angebote"]'); await page.click('#fab');
  await page.fill('#a-name', 'Test'); await page.click('.stepnav .next');
  const og = await page.$$eval('#angAdd optgroup', e => e.map(x => x.label + ':' + x.children.length));
  assert(og.length === 7 && /Abdichtung:6/.test(og.join(' ')), 'Angebot: Preisliste mit Gruppen ' + og.join(' '));
  await page.selectOption('#angAdd', 'dichtecke-innen');
  assert(await page.inputValue('#angBody .pos[data-i="0"] [data-pf="price"]') === '8,50' && await page.inputValue('#angBody .pos[data-i="0"] [data-pf="unit"]') === 'Stk', 'eigener Preis für Dichtband-Innenecke');
  await page.click('[data-act="cancel"]');
  // Aufmaß-Bereich → Angebot
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Bad', party: 'Meier', ckind: 'privat', status: 'Anfrage', amount: 0, _t: 1,
      aufmass: { date: '2026-11-21', rows: [{ room: 'Bad', type: 'xold', l: '', b: '', n: '4', abz: '' }] } }]));
    const st = JSON.parse(localStorage.getItem('belegbuch:settings') || '[]').filter(x => x.id !== 'aufmass');
    st.push({ id: 'aufmass', types: [{ id: 'xold', name: 'Dichtecke innen', unit: 'Stk', katId: '' }], _t: 1 }); localStorage.setItem('belegbuch:settings', JSON.stringify(st));
    localStorage.setItem('belegbuch:ui-fa', JSON.stringify({ kind: 'kunde', open: true }));
  });
  await page.reload(); await page.waitForSelector('#angeboteList'); await page.click('#backBtn'); await page.click('.mtile[data-tab="auftraege"]');
  await page.click('#auftraegeList [data-act="angebot"]'); await page.waitForSelector('.ampanel');
  const t = await page.inputValue('#angBody .pos[data-i="0"] textarea'), pr = await page.inputValue('#angBody .pos[data-i="0"] [data-pf="price"]');
  assert(/Bad: Dichtecke innen/.test(t) && pr === '8,50', 'älterer eigener Bereich ohne Zuordnung findet die Preislisten-Position: ' + t + ' @ ' + pr);
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
