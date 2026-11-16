const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const fs = require('fs');
// Texterkennung beim Hinzufügen eines Belegs. Die Erkennungsbibliothek ist hier NACHGEBAUT
// (liefert festen Text); geprüft wird das Auslesen der Werte und das Füllen des Formulars,
// nicht die Qualität der echten Erkennung.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const BON = `famila Stralsund II
Grünhufer Bogen 13-17
18437 Stralsund
Tel. 03831/12345
Versandtasche B4            2,99 A
SUMME            EUR        2,99
Bar                         5,00
Rückgeld                    2,01
A 19,0%  Netto 2,51  MwSt 0,48  Brutto 2,99
11.11.2026 14:32  Bon 27/86`;
const RECHNUNG = `Adolf Würth GmbH & Co. KG
Niederlassung Stralsund · Werftstraße 10 · 18439 Stralsund
FFH Fliesenleger Fachbetrieb
Musterweg 1
18439 Stralsund
Rechnung Nr. 6089029440
Rechnungsdatum: 21.09.2026   Lieferdatum: 18.09.2026
59 Silikondichtstoff  4,69   276,91
Nettobetrag 276,91
MwSt 19 % 52,61
Rechnungsbetrag EUR 1.329,52
Zahlbar bis 11.10.2026`;
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
async function open(b, text) {
  const page = await (await b.newContext({ viewport: { width: 400, height: 800 } })).newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.addInitScript(text => { if (text != null) window.Tesseract = { createWorker: async (lang, oem, o) => ({ recognize: async () => { o.logger({ status: 'recognizing text', progress: 0.5 }); return { data: { text } }; } }) }; }, text);
  await page.goto(APP); await page.waitForSelector('#backupInfo');
  await page.evaluate(() => { localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', street: 'Musterweg 1', city: '18439 Stralsund' }])); localStorage.setItem('belegbuch:belege', JSON.stringify([{ id: 'x1', date: '2026-01-05', vendor: 'Würth', gross: 10, vat: 19, cat: 'Material', pay: 'Bar' }])); });
  await page.reload(); await page.waitForSelector('#backupInfo');
  await page.click('[data-act="tab"][data-tab="belege"]'); await page.click('#fab'); return page;
}
const fields = p => p.evaluate(() => ['f-vendor', 'f-gross', 'f-date', 'f-vat', 'f-vaddr', 'f-place'].map(i => document.getElementById(i).value).join(' | '));
(async () => {
  fs.writeFileSync(TMP + '/bon.png', PNG);
  const b = await chromium.launch();
  let p = await open(b, BON); await p.setInputFiles('#photoFile', TMP + '/bon.png'); await p.waitForFunction(() => /Erkannt|nicht/.test(document.querySelector('#photoBox').textContent));
  assert(await fields(p) === 'famila Stralsund II | 2,99 | 2026-11-11 | 19 | Grünhufer Bogen 13-17, 18437 Stralsund | Stralsund', 'Kassenbon: ' + await fields(p));
  assert(/Lieferant, Betrag, Datum, Adresse, Ort/.test(await p.textContent('#photoBox')), 'Meldung nennt die gefüllten Felder');
  assert(Number((await p.inputValue('#f-km')).replace(',', '.')) > 0, 'Fahrstrecke wird danach geschätzt: ' + await p.inputValue('#f-km') + ' km');
  await p.click('[data-act="save"]'); await p.waitForSelector('#belegeList img.thumb'); assert(true, 'Beleg mit Foto gespeichert');
  p = await open(b, RECHNUNG); await p.setInputFiles('#photoFile', TMP + '/bon.png'); await p.waitForFunction(() => /Erkannt|nicht/.test(document.querySelector('#photoBox').textContent));
  assert(await fields(p) === 'Würth | 1329,52 | 2026-09-21 | 19 | Werftstraße 10, 18439 Stralsund | Stralsund', 'Rechnung (bekannter Lieferant, eigene Adresse übergangen): ' + await fields(p));
  p = await open(b, BON); await p.fill('#f-vendor', 'Mein Eintrag'); await p.fill('#f-gross', '7'); await p.setInputFiles('#photoFile', TMP + '/bon.png'); await p.waitForFunction(() => /Erkannt|nicht/.test(document.querySelector('#photoBox').textContent));
  assert((await fields(p)).startsWith('Mein Eintrag | 7 |'), 'ausgefüllte Felder werden nicht überschrieben');
  p = await open(b, 'xx ~~ 1l| ..'); await p.setInputFiles('#photoFile', TMP + '/bon.png'); await p.waitForFunction(() => /Erkannt|nicht/.test(document.querySelector('#photoBox').textContent));
  assert(/nicht sicher lesen/.test(await p.textContent('#photoBox')) && (await fields(p)).startsWith(' |  |'), 'unlesbarer Text: nichts eingetragen');
  p = await open(b, null); await p.setInputFiles('#photoFile', TMP + '/bon.png'); await p.waitForFunction(() => /Internet|geklappt/.test(document.querySelector('#photoBox').textContent), null, { timeout: 40000 });
  assert(/Internet/.test(await p.textContent('#photoBox')) && await p.$('#photoBox img.thumb'), 'ohne Netz: Hinweis, Foto bleibt am Beleg');
  console.log('Fehler: ' + (p.errs.join('|') || 'keine')); await b.close();
})();
