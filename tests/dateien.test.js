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
  await A.click('[data-act="tab"][data-tab="ordner"]'); await A.setInputFiles('#ordnerFile', TMP + '/vertrag.pdf'); await A.waitForSelector('#ordnerList a');
  assert((await A.getAttribute('#ordnerList a', 'href')).startsWith('blob:') && await A.inputValue('#ordnerList .docname') === 'vertrag.pdf', 'PDF im Ordner mit Öffnen-Link');
  await A.reload(); await A.waitForSelector('#ordnerList a');
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
  await B.click('[data-act="tab"][data-tab="ordner"]'); await B.waitForSelector('#ordnerList a'); assert(true, 'Gerät 2: PDF im Ordner');
  // Wiederherstellen einer Sicherung mit Dateien auf einem leeren Gerät
  const C = await device(b); await C.setInputFiles('#backupFile', sf); await C.waitForSelector('#restoreAsk:not([hidden])');
  assert(/2 Dateien/.test(await C.textContent('#restoreText')), 'Nachfrage nennt die Dateien');
  await C.click('[data-act="restore-yes"]'); await C.click('[data-act="tab"][data-tab="belege"]'); await C.waitForSelector('#belegeList img.thumb'); assert(true, 'Gerät 3: Foto nach Wiederherstellung');
  console.log('Fehler: ' + ([A, B, C].map(p => p.errs.join('|')).filter(Boolean).join(' || ') || 'keine')); await b.close();
})();
