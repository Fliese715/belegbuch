const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const fs = require('fs');
// Navigation über das Startmenü: erst zurück ins Menü, dann die Kachel antippen.
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
// Automatische Sicherung (Gerätespeicher + Ordner), Passwort-Verschlüsselung, Öffnen auf einem zweiten Gerät.
const SEED = [{ id: 'x1', date: '2026-11-10', vendor: 'Würth', gross: 10, vat: 19, cat: 'Material', pay: 'Bar', _t: 1000 }];
async function device(b, seed) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await page.addInitScript(seed => {
    if (seed && !localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('belegbuch:belege', JSON.stringify(seed)); }
    window.__files = {};
    window.showDirectoryPicker = async () => ({ name: 'Sicherungen', getFileHandle: async n => ({ createWritable: async () => ({ write: async t => { window.__files[n] = t; }, close: async () => { } }) }) });
  }, seed);
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' }); return page;
}
const snaps = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('belegbuch-sicherung'); r.onsuccess = () => { const q = r.result.transaction('snap').objectStore('snap').getAll(); q.onsuccess = () => res(q.result.map(x => ({ enc: x.enc, plain: x.text.includes('Würth') }))); }; }));
const vendors = p => p.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:belege') || '[]').map(x => x.vendor).sort().join(', '));
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const A = await device(b, SEED);
  await A.waitForFunction(() => /1 Stand/.test(document.querySelector('#autoInfo').textContent));
  let s = await snaps(A); assert(s.length === 1 && !s[0].enc && s[0].plain, 'erster automatischer Stand beim Start, unverschlüsselt');
  await nav(A, 'sicherung'); await A.fill('#pwNew', 'kurz'); await A.click('[data-act="pw-set"]'); assert(/mindestens 8/.test(await A.textContent('#backupMsg')), 'zu kurzes Passwort wird abgelehnt');
  await nav(A, 'sicherung'); await A.fill('#pwNew', 'geheim-1234'); await A.click('[data-act="pw-set"]');
  await A.waitForFunction(() => /2 Stände/.test(document.querySelector('#autoInfo').textContent));
  s = await snaps(A); assert(s[1].enc && !s[1].plain, 'nach Passwort: neuer Stand ist verschlüsselt, kein Klartext');
  assert(/Passwort ist gesetzt/.test(await A.textContent('#pwInfo')), 'Status: Passwort gesetzt');
  await nav(A, 'sicherung'); const [d] = await Promise.all([A.waitForEvent('download'), A.click('[data-act="backup-save"]')]); const file = TMP + '/sicherung-enc.json'; await d.saveAs(file);
  const raw = fs.readFileSync(file, 'utf8'); assert(/"enc":"AES-GCM"/.test(raw) && !raw.includes('Würth') && !raw.includes('belege'), 'Sicherungsdatei ist verschlüsselt (' + raw.length + ' Zeichen)');
  // 30-Minuten-Takt: ohne Änderung kein neuer Stand, mit Änderung nach 30 Minuten schon
  const tick = async () => { await A.evaluate(() => { localStorage.setItem('belegbuch:lastauto', String(Date.now() - 31 * 60000)); document.dispatchEvent(new Event('visibilitychange')); }); await A.waitForTimeout(700); };
  await A.evaluate(() => { localStorage.setItem('belegbuch:lastauto', String(Date.now() + 1000)); document.dispatchEvent(new Event('visibilitychange')); }); await A.waitForTimeout(500);
  assert((await snaps(A)).length === 2, 'vor Ablauf von 30 Minuten kein neuer Stand');
  await nav(A, 'belege'); await A.click('#fab'); await A.fill('#f-vendor', 'Hornbach'); await A.fill('#f-gross', '9'); await A.click('[data-act="save"]'); await A.waitForTimeout(300);
  await tick(); assert((await snaps(A)).length === 3, 'nach 30 Minuten mit Änderung: neuer Stand');
  // Sicherungsordner
  await nav(A, 'sicherung'); await A.click('[data-act="dir-pick"]'); await A.waitForFunction(() => Object.keys(window.__files).length === 2);
  const names = await A.evaluate(() => Object.keys(window.__files).sort().join(' ')); assert(/belegbuch-sicherung-\d{4}-\d{2}-\d{2}\.json belegbuch-sicherung-auto\.json/.test(names), 'Ordner: ' + names);
  assert(await A.evaluate(() => Object.values(window.__files).every(t => t.includes('AES-GCM') && !t.includes('Würth'))), 'Dateien im Ordner sind verschlüsselt');
  assert(/Sicherungsordner „Sicherungen“/.test(await A.textContent('#autoInfo')), 'Status nennt den Ordner');
  // älteren Stand aus der Liste wiederherstellen (eigener Schlüssel, keine Passwortfrage)
  await nav(A, 'sicherung'); const opts = await A.$$eval('#snapSel option', o => o.map(x => x.value)); await A.selectOption('#snapSel', opts[opts.length - 2]);
  await nav(A, 'sicherung'); await A.click('[data-act="snap-restore"]'); await A.waitForSelector('#restoreAsk:not([hidden])'); await A.click('[data-act="restore-yes"]'); await A.waitForTimeout(400);
  assert(await vendors(A) === 'Würth', 'Stand aus der Liste wiederhergestellt: ' + await vendors(A));
  // zweites Gerät ohne Schlüssel
  const B = await device(b, null);
  await nav(B, 'sicherung'); await B.setInputFiles('#backupFile', file); await B.waitForSelector('#pwDlg:not([hidden])');
  await B.fill('#pwDlgIn', 'falsch-0000'); await B.click('[data-act="pw-ok"]'); await B.waitForFunction(() => /passt nicht/.test(document.querySelector('#pwDlgMsg').textContent));
  assert(true, 'falsches Passwort wird abgelehnt');
  await B.fill('#pwDlgIn', 'geheim-1234'); await B.press('#pwDlgIn', 'Enter'); await B.waitForSelector('#restoreAsk:not([hidden])');
  await nav(B, 'sicherung'); await B.click('[data-act="restore-yes"]'); await B.waitForTimeout(400); assert(await vendors(B) === 'Würth', 'zweites Gerät: mit Passwort wiederhergestellt');
  // Abgleich-Datei ist ebenfalls verschlüsselt und lässt sich mit Passwort laden
  await nav(A, 'sicherung'); const [d2] = await Promise.all([A.waitForEvent('download'), A.click('[data-act="sync-save"]')]); const sf = TMP + '/abgleich-enc.json'; await d2.saveAs(sf);
  assert(!fs.readFileSync(sf, 'utf8').includes('Würth'), 'Abgleich-Datei ist verschlüsselt');
  const C = await device(b, null); await nav(C, 'sicherung'); await C.setInputFiles('#syncFile', sf); await C.waitForSelector('#pwDlg:not([hidden])'); await C.click('[data-act="pw-cancel"]');
  await C.waitForFunction(() => /Abgebrochen/.test(document.querySelector('#syncMsg').textContent)); assert(await vendors(C) === '', 'Abbruch der Passwortfrage lädt nichts');
  await C.setInputFiles('#syncFile', sf); await C.waitForSelector('#pwDlg:not([hidden])'); await C.fill('#pwDlgIn', 'geheim-1234'); await C.click('[data-act="pw-ok"]');
  await C.waitForFunction(() => /Abgleich:/.test(document.querySelector('#syncMsg').textContent)); assert(await vendors(C) === 'Würth', 'Abgleich mit Passwort: ' + await vendors(C));
  // Schlüssel bleibt nach Neuladen, Passwort entfernen
  await A.reload(); await A.waitForFunction(() => /Passwort ist gesetzt/.test(document.querySelector('#pwInfo').textContent)); assert(true, 'Schlüssel bleibt nach Neuladen erhalten');
  await nav(A, 'sicherung'); await A.click('[data-act="pw-clear"]'); await A.waitForFunction(() => /Kein Passwort/.test(document.querySelector('#pwInfo').textContent)); assert(true, 'Passwort lässt sich entfernen');
  console.log('Fehler: ' + ([A, B, C].map(p => p.errs.join('|')).filter(Boolean).join(' || ') || 'keine')); await b.close();
})();
