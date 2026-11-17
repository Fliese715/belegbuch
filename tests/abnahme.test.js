const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright'); const fs = require('fs');
// Fotodokumentation je Baustelle, Abnahmeprotokoll mit Unterschrift, Mängel und Gewährleistung.
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
const TMP = require('os').tmpdir();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const days = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  fs.writeFileSync(TMP + '/foto.png', PNG);
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.addInitScript(() => { window.__pdf = []; window.__img = 0; window.jspdf = { jsPDF: function () { const self = new Proxy({}, { get: (t, k) => k === 'text' ? (s => { window.__pdf.push([].concat(s).join(' ')); return self; }) : k === 'splitTextToSize' ? (s => String(s).split('\n')) : k === 'getNumberOfPages' ? (() => 1) : k === 'addImage' ? (() => { window.__img++; return self; }) : k === 'output' ? (() => new Blob(['%PDF'], { type: 'application/pdf' })) : (() => self) }); return self; } }; });
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.evaluate(([y4]) => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'Test Fliesen', owner: 'Max Test', kleinunt: true }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', title: 'Bad EG', party: 'Meier', site: 'Lindenweg 12', amount: 1000, status: 'In Arbeit', date: '2026-02-01', due: '2099-12-31', terms: 14 },
      { id: 'b2', kind: 'kunde', title: 'Altbau Küche', party: 'Schulz', amount: 500, status: 'Bezahlt', date: '2021-01-01', due: '2021-02-01', terms: 14, abnahme: { date: y4, result: 'ok', years: 5 } },
      { id: 'b3', kind: 'kunde', title: 'Anfrage Flur', party: 'Neu', amount: 0, status: 'Anfrage', date: '2026-03-01', due: '2099-12-31', terms: 14 }]));
  }, [(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 5); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })()]);
  await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.click('[data-act="tab"][data-tab="uebersicht"]');
  assert(/Gewährleistung endet am .*Altbau Küche/.test(await page.textContent('#todo')), 'Zu erledigen: Gewährleistung Altbau Küche endet in 30 Tagen');
  // Fotos
  await page.click('[data-act="tab"][data-tab="auftraege"]');
  assert(!/data-act="abnahme"/.test(await page.innerHTML('#auftraegeList article:has-text("Anfrage Flur")')), 'bei einer Anfrage noch kein Abnahme-Knopf');
  await page.click('#auftraegeList article:has-text("Bad EG") .vendor'); await page.waitForSelector('#photosBox');
  await page.selectOption('#ph-kind', 'vorher'); await page.setInputFiles('#ph-file', TMP + '/foto.png'); await page.waitForSelector('#photosBox img');
  await page.selectOption('#ph-kind', 'mangel'); await page.fill('#ph-note', 'Riss Ecke'); await page.setInputFiles('#ph-file', TMP + '/foto.png'); await page.waitForFunction(() => document.querySelectorAll('#photosBox img').length === 2);
  assert(/Vorher/.test(await page.textContent('#photosBox')) && /Mangel\s*Riss Ecke/.test(await page.textContent('#photosBox')), 'zwei Fotos mit Art und Notiz');
  await page.click('#photosBox img >> nth=1'); await page.waitForSelector('#viewer:not([hidden]) img'); assert(await page.textContent('#viewerT') === 'Mangel: Riss Ecke', 'Foto öffnet groß'); await page.click('[data-act="viewer-close"]');
  await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  assert(/2 Fotos/.test(await page.textContent('#auftraegeList article:has-text("Bad EG")')), 'Karte: 2 Fotos');
  // Abnahme mit Mängeln und Unterschrift
  await page.click('#auftraegeList article:has-text("Bad EG") [data-act="abnahme"]'); await page.waitForSelector('#sigK');
  await page.selectOption('#ab-result', 'maengel'); await page.click('[data-act="ab-save"]');
  assert(/Mängel eintragen/.test(await page.textContent('#formErr')), 'Mängel ohne Text werden abgelehnt');
  await page.fill('#ab-maengel', 'Silikonfuge Dusche nachziehen\nFliese Ecke links ersetzen'); await page.fill('#ab-frist', days(-1));
  await page.$eval('#sigK', c => c.scrollIntoView({ block: 'center' })); const box = await page.$eval('#sigK', c => { const r = c.getBoundingClientRect(); return [r.x, r.y]; });
  await page.mouse.move(box[0] + 20, box[1] + 40); await page.mouse.down(); await page.mouse.move(box[0] + 120, box[1] + 80, { steps: 8 }); await page.mouse.move(box[0] + 200, box[1] + 30, { steps: 8 }); await page.mouse.up();
  await page.click('[data-act="ab-save"]'); await page.waitForTimeout(300);
  const ab = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('belegbuch:auftraege')).find(x => x.id === 'b1'); return [a.status, a.abnahme.result, (a.abnahme.sigK || '').slice(0, 22), a.abnahme.sigA, (a.photos || []).length].join('|'); });
  assert(ab === 'Abgenommen|maengel|data:image/png;base64,||2', 'Abnahme gespeichert: Status Abgenommen, Unterschrift Kunde, Fotos bleiben: ' + ab);
  const card = await page.textContent('#auftraegeList article:has-text("Bad EG")');
  assert(/Abnahme ✓/.test(card) && /Mängel offen · Frist/.test(card) && /Gewährleistung bis/.test(card), 'Karte: Abnahme ✓, Mängel offen, Gewährleistung');
  await page.click('[data-act="tab"][data-tab="uebersicht"]'); assert(/Mängel offen: Bad EG/.test(await page.textContent('#todo')), 'Zu erledigen: Mängel offen');
  // PDF
  await page.click('#todo [data-act="abnahme"]:has-text("Mängel offen")'); await page.waitForSelector('[data-act="ab-pdf"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ab-pdf"]')]);
  const t = await page.evaluate(() => window.__pdf.join(' | ')), img = await page.evaluate(() => window.__img);
  assert(dl.suggestedFilename() === 'Abnahmeprotokoll-Bad-EG.pdf' && /unter Vorbehalt/.test(t) && /2\. Fliese Ecke links ersetzen/.test(t) && /5 Jahre ab Abnahme/.test(t) && img === 1, 'PDF (Attrappe): Ergebnis, Mängelliste, Gewährleistung, 1 Unterschrift');
  // Mängel erledigt
  await page.fill('#ab-mdone', days(0)); await page.click('[data-act="ab-save"]'); await page.waitForTimeout(300);
  assert(!/Mängel offen/.test(await page.textContent('#todo')), 'nach „Mängel beseitigt“ kein Hinweis mehr');
  // Sicherung enthält Baustellenfotos
  await page.click('[data-act="tab"][data-tab="sicherung"]'); const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="sync-save"]')]); await d2.saveAs(TMP + '/ab.json');
  assert(Object.keys(JSON.parse(fs.readFileSync(TMP + '/ab.json', 'utf8')).files).length === 2, 'Abgleich-Datei enthält beide Baustellenfotos');
  console.log('Fehler: ' + (errs.join('|') || 'keine')); await b.close();
})();
