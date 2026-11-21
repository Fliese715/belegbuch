// Aufmaß: Maße addieren (+), Rechenweg je Zeile, Summe je Raum, Fehlerhinweis, Plus-Knopf, Speichern, CSV mit Rechenweg.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  // Nachgebaute PDF-Bibliothek (wie in pdf-attrappe.test.js): sammelt nur die geschriebenen Texte.
  await page.addInitScript(() => {
    window.__pdf = [];
    window.jspdf = { jsPDF: function () {
      let pages = 1; const self = new Proxy({}, { get: (t, k) => {
        if (k === 'text') return (s) => { window.__pdf.push([].concat(s).join(' ')); return self; };
        if (k === 'splitTextToSize') return (s) => String(s).split('\n');
        if (k === 'getNumberOfPages') return () => pages;
        if (k === 'addPage') return () => { pages++; return self; };
        if (k === 'output') return () => new Blob(['%PDF-attrappe'], { type: 'application/pdf' });
        return () => self; } });
      return self; } };
  });
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Bad EG Meier', party: 'Meier', site: 'Lindenweg 2', status: 'Beauftragt', amount: 0, _t: 1 }])));
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="auftraege"]');
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  const f = (i, k, v) => page.fill(`#amBody .pos[data-i="${i}"] [data-f="${k}"]`, v);
  const res = i => page.textContent(`#amBody .pos[data-i="${i}"] [data-res]`);
  await f(0, 'room', 'Bad'); await f(0, 'l', '2,45');
  await page.click('#amBody .pos[data-i="0"] [data-act="am-plus"][data-k="l"]'); await page.keyboard.type('1,80');
  assert(await page.inputValue('#amBody .pos[data-i="0"] [data-f="l"]') === '2,45 + 1,80', 'Plus-Knopf hängt „ + “ an, Cursor bleibt im Feld');
  await f(0, 'b', '1,80');
  assert(/\(2,45 \+ 1,80\) × 1,80 =\s*7,65 m²/.test(await res(0)), 'Rechenweg Boden: ' + (await res(0)).trim());
  await page.click('[data-act="am-add"]');
  assert(await page.inputValue('#amBody .pos[data-i="1"] [data-f="room"]') === 'Bad', '„+ Zeile im selben Raum“ übernimmt den Raum');
  await page.selectOption('#amBody .pos[data-i="1"] [data-f="type"]', 'wand');
  await f(1, 'l', '2,45+1,80+2,45+1,80'); await f(1, 'b', '2,50'); await f(1, 'abz', '0,885x2,01');
  assert(/\(2,45 \+ 1,80 \+ 2,45 \+ 1,80\) × 2,50 − 0,885 × 2,01 =\s*19,47 m²/.test(await res(1)), 'Rechenweg Wand mit Abzug: ' + (await res(1)).trim());
  await page.click('[data-act="am-room"]');
  assert(await page.inputValue('#amBody .pos[data-i="2"] [data-f="room"]') === '' && await page.evaluate(() => document.activeElement.matches('.pos[data-i="2"] [data-f="room"]')), '„+ Neuer Raum“: leerer Raum, Cursor im Raumfeld');
  await f(2, 'room', 'Flur'); await f(2, 'l', '4,2'); await f(2, 'b', '1,1');
  await page.click('[data-act="am-add"]'); await page.selectOption('#amBody .pos[data-i="3"] [data-f="type"]', 'sockel');
  await f(3, 'l', '(4,2 + 1,1) x 2'); await f(3, 'abz', '0,885; 0,76');
  assert(/\(4,2 \+ 1,1\) × 2 − 0,885 − 0,76 =\s*8,96 lfm/.test(await res(3)), 'Klammern und mehrere Abzüge: ' + (await res(3)).trim());
  const rooms = await page.$$eval('.amroom', e => e.map(x => x.textContent.replace(/\s+/g, ' ')));
  assert(rooms.length === 2 && /Bad.*Boden 7,65 m² · Wand 19,47 m²/.test(rooms[0]) && /Flur.*Boden 4,62 m² · Sockel 8,96 lfm/.test(rooms[1]), 'Summe je Raum: ' + rooms.join(' | '));
  assert(/Fläche gesamt\s*31,74 m²/.test(await page.textContent('#amSum')), 'Gesamtfläche 31,74 m²');
  await f(2, 'b', '1,1+');
  assert(/Eingabe prüfen/.test(await res(2)), 'Tippfehler wird angezeigt');
  await f(2, 'b', '1.1');
  assert(/4,2 × 1,1 =\s*4,62 m²/.test(await res(2)), 'Punkt als Komma erlaubt');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="am-csv"]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert(/Rechenweg/.test(csv) && /\(2,45 \+ 1,80 \+ 2,45 \+ 1,80\) × 2,50 − 0,885 × 2,01/.test(csv), 'CSV enthält den Rechenweg');
  await Promise.all([page.waitForEvent('download'), page.click('[data-act="am-pdf"]')]);
  const pdf = (await page.evaluate(() => window.__pdf)).join(' | ');
  assert(/\(2,45 \+ 1,80 \+ 2,45 \+ 1,80\) × 2,50 − 0,885 × 2,01/.test(pdf) && /Summe je Raum/.test(pdf) && /Boden 7,65 m² · Wand 19,47 m²/.test(pdf), 'PDF mit Rechenweg und Summe je Raum');
  await page.click('[data-act="am-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  const a = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege'))[0]);
  assert(a.aufmass.rows.length === 4 && a.aufmass.rows[1].l === '2,45+1,80+2,45+1,80' && a.area === 31.74, 'gespeichert, Eingaben bleiben als Rechnung erhalten, Fläche 31,74');
  await page.click('#auftraegeList [data-act="aufmass"]'); await page.waitForSelector('#amBody .pos');
  assert(/19,47 m²/.test(await res(1)), 'nach dem Öffnen wieder mit Rechenweg');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
