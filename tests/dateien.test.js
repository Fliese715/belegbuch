const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const fs = require('fs');
// Fotos und PDFs: lokal hinzufügen, in Sicherung/Abgleich-Datei enthalten, auf zweitem Gerät wieder da.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
async function device(b) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(APP); await page.waitForSelector('#backupInfo'); return page;
}
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
(async () => {
  fs.writeFileSync(TMP + '/bon.png', PNG); fs.writeFileSync(TMP + '/vertrag.pdf', PDF);
  const b = await chromium.launch(); const A = await device(b);
  // Beleg mit Foto
  await A.click('[data-act="tab"][data-tab="belege"]'); await A.click('#fab'); await A.fill('#f-vendor', 'Bauhaus'); await A.fill('#f-gross', '20');
  await A.setInputFiles('#photoFile', TMP + '/bon.png'); await A.waitForSelector('#photoBox img.thumb');
  assert((await A.getAttribute('#photoBox img.thumb', 'src')).startsWith('blob:'), 'Foto im Formular sichtbar');
  await A.click('[data-act="save"]'); await A.waitForSelector('#belegeList img.thumb');
  assert(await A.$eval('#belegeList img.thumb', i => new Promise(r => { if (i.complete) r(i.naturalWidth > 0); else { i.onload = () => r(true); i.onerror = () => r(false); } })), 'Foto in der Liste lädt');
  assert(!/kein Foto/.test(await A.evaluate(() => document.querySelector('#todo').textContent)), 'kein „Foto fehlt“-Hinweis');
  // PDF im Ordner
  await A.click('[data-act="tab"][data-tab="ordner"]'); await A.setInputFiles('#ordnerFile', TMP + '/vertrag.pdf'); await A.waitForSelector('#ordnerList [data-act="file-open"]');
  assert(await A.inputValue('#ordnerList .docname') === 'vertrag.pdf', 'PDF im Ordner mit Öffnen-Knopf');
  // Anzeige in der App: PDF aus dem Ordner
  await A.click('#ordnerList [data-act="file-open"]'); await A.waitForSelector('#viewer:not([hidden]) iframe');
  assert((await A.getAttribute('#viewer iframe', 'src')).startsWith('blob:') && await A.textContent('#viewerT') === 'vertrag', 'PDF-Anzeige öffnet sich in der App');
  const [dv] = await Promise.all([A.waitForEvent('download'), A.click('[data-act="viewer-save"]')]); await dv.saveAs(TMP + '/aus-app.pdf');
  assert(dv.suggestedFilename() === 'vertrag.pdf' && fs.readFileSync(TMP + '/aus-app.pdf').equals(PDF), 'PDF speichern: ' + dv.suggestedFilename() + ', Inhalt unverändert');
  await A.keyboard.press('Escape'); assert(await A.$eval('#viewer', v => v.hidden), 'Anzeige schließt mit Escape');
  // Anzeige in der App: Foto über die Miniatur in der Liste und über das Formular
  await A.click('[data-act="tab"][data-tab="belege"]'); await A.click('#belegeList img.thumb'); await A.waitForSelector('#viewer:not([hidden]) img');
  assert(await A.$eval('#viewer img', i => new Promise(r => { if (i.complete) r(i.naturalWidth > 0); else { i.onload = () => r(true); i.onerror = () => r(false); } })) && await A.$eval('#sheet', x => x.hidden), 'Tipp auf die Miniatur zeigt das Foto, ohne das Formular zu öffnen');
  await A.click('#viewer img'); assert(await A.$eval('#viewer img', i => i.classList.contains('zoom')), 'Tippen vergrößert');
  await A.click('[data-act="viewer-close"]');
  await A.click('#belegeList article .main'); await A.waitForSelector('#photoBox [data-act="file-open"]'); await A.click('#photoBox [data-act="file-open"]'); await A.waitForSelector('#viewer:not([hidden]) img');
  assert(await A.textContent('#viewerT') === 'Beleg Bauhaus', 'Öffnen im Formular: ' + await A.textContent('#viewerT'));
  await A.click('[data-act="viewer-close"]'); await A.keyboard.press('Escape');
  await A.click('[data-act="tab"][data-tab="ordner"]');
  await A.reload(); await A.waitForSelector('#ordnerList [data-act="file-open"]');
  assert(true, 'Dateien bleiben nach Neuladen');
  // Sicherung enthält die Dateien
  await A.click('[data-act="tab"][data-tab="uebersicht"]');
  const [d] = await Promise.all([A.waitForEvent('download'), A.click('[data-act="sync-save"]')]); const sf = TMP + '/abgleich-dateien.json'; await d.saveAs(sf);
  const o = JSON.parse(fs.readFileSync(sf, 'utf8')); const fl = Object.values(o.files || {});
  assert(fl.length === 2 && fl.some(f => f.type === 'application/pdf' && Buffer.from(f.b64, 'base64').equals(PDF)), 'Abgleich-Datei enthält 2 Dateien, PDF unverändert');
  // zweites Gerät
  const B = await device(b); await B.setInputFiles('#syncFile', sf); await B.waitForFunction(() => /Abgleich:/.test(document.querySelector('#syncMsg').textContent));
  assert(/2 Dateien übernommen/.test(await B.textContent('#syncMsg')), 'Gerät 2: ' + (await B.textContent('#syncMsg')).slice(0, 70));
  await B.click('[data-act="tab"][data-tab="belege"]'); await B.waitForSelector('#belegeList img.thumb'); assert(true, 'Gerät 2: Foto am Beleg');
  await B.click('[data-act="tab"][data-tab="ordner"]'); await B.waitForSelector('#ordnerList [data-act="file-open"]'); assert(true, 'Gerät 2: PDF im Ordner');
  // Wiederherstellen einer Sicherung mit Dateien auf einem leeren Gerät
  const C = await device(b); await C.setInputFiles('#backupFile', sf); await C.waitForSelector('#restoreAsk:not([hidden])');
  assert(/2 Dateien/.test(await C.textContent('#restoreText')), 'Nachfrage nennt die Dateien');
  await C.click('[data-act="restore-yes"]'); await C.click('[data-act="tab"][data-tab="belege"]'); await C.waitForSelector('#belegeList img.thumb'); assert(true, 'Gerät 3: Foto nach Wiederherstellung');
  console.log('Fehler: ' + ([A, B, C].map(p => p.errs.join('|')).filter(Boolean).join(' || ') || 'keine')); await b.close();
})();
