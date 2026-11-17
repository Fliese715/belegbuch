const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const fs = require('fs');
// Navigation über das Startmenü: erst zurück ins Menü, dann die Kachel antippen.
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
// Sicherung speichern, Daten ändern, wiederherstellen (ersetzt alles), rückgängig machen, Hinweis in „Zu erledigen“.
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  // Startdaten einmal setzen (kein Init-Skript: das würde bei jedem Neuladen erneut laufen)
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.evaluate(() => localStorage.setItem('belegbuch:belege', JSON.stringify([{ id: 'x1', date: '2026-11-10', vendor: 'Würth', gross: 10, vat: 19, cat: 'Material', pay: 'Bar', _t: 1000 }, { id: 'x2', date: '2026-11-11', vendor: 'Famila', gross: 3, vat: 19, cat: 'Material', pay: 'Bar', _t: 1000 }])));
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  const ids = () => page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:belege')).map(x => x.vendor).sort().join(', '));
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  assert(await page.$eval('.mtile[data-tab="sicherung"]', x => x.querySelector('b').textContent.replace(/\u00ad/g, '') === 'Datensicherung' && x.classList.contains('safe') && !x.nextElementSibling), 'Menükachel „Datensicherung“ farbig, ganz hinten');
  assert(!(await page.$('#v-uebersicht #backupInfo')) && !(await page.$('#v-uebersicht #syncInfo')), 'Sicherung und Abgleich sind aus der Übersicht umgezogen');
  await nav(page, 'erledigen'); await page.click('#todo [data-act="goto-backup"]'); assert(await page.$eval('#v-sicherung', x => !x.hidden), 'Hinweis „Sichern“ öffnet den Reiter Datensicherung');
  await nav(page, 'uebersicht');
  assert(/noch keine Sicherung/.test(await page.textContent('#todo')), 'Hinweis ohne Sicherung: ' + (await page.textContent('#todo')).slice(0, 60));
  await nav(page, 'sicherung'); const [d] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup-save"]')]);
  const file = TMP + '/sicherung.json'; await d.saveAs(file);
  assert(/^ffh-bau-buero-sicherung-\d{4}-\d{2}-\d{2}\.json$/.test(d.suggestedFilename()), 'Dateiname ' + d.suggestedFilename());
  assert(!/Sicherung/.test(await page.textContent('#todo')), 'Hinweis verschwindet nach dem Sichern');
  assert(/aktuell/.test(await page.textContent('#backupInfo')), 'Status: ' + (await page.textContent('#backupInfo')).slice(-45));
  // ändern: einen Beleg anlegen, einen löschen
  await nav(page, 'belege'); await page.click('#fab'); await page.fill('#f-vendor', 'Hornbach'); await page.fill('#f-gross', '9'); await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  await page.click('#belegeList article:has-text("Famila")'); await page.click('#sheet [data-act="delete"]'); await page.waitForTimeout(200);
  if (await page.locator('#sheet [data-act="delete"]').count()) await page.click('#sheet [data-act="delete"]').catch(() => { });
  await page.waitForTimeout(300);
  assert(await ids() === 'Hornbach, Würth', 'nach Änderungen: ' + await ids());
  await nav(page, 'uebersicht');
  assert(/seitdem geändert/.test(await page.textContent('#backupInfo')), 'Status zeigt Änderung seit der Sicherung');
  // falsche Datei
  await nav(page, 'sicherung'); fs.writeFileSync(TMP + '/falsch.json', '{"a":1}'); await page.setInputFiles('#backupFile', TMP + '/falsch.json'); await page.waitForTimeout(200);
  assert(/keine Sicherung/.test(await page.textContent('#backupMsg')), 'falsche Datei wird abgelehnt');
  // wiederherstellen: erst Nachfrage, Abbrechen ändert nichts
  await nav(page, 'sicherung'); await page.setInputFiles('#backupFile', file); await page.waitForSelector('#restoreAsk:not([hidden])');
  assert(/2 Belege/.test(await page.textContent('#restoreText')), 'Nachfrage: ' + (await page.textContent('#restoreText')).slice(0, 70));
  await nav(page, 'sicherung'); await page.click('[data-act="restore-no"]'); assert(await ids() === 'Hornbach, Würth', 'Abbrechen ändert nichts');
  await nav(page, 'sicherung'); await page.setInputFiles('#backupFile', file); await page.waitForSelector('#restoreAsk:not([hidden])'); await page.click('[data-act="restore-yes"]'); await page.waitForTimeout(400);
  assert(await ids() === 'Famila, Würth', 'nach Wiederherstellung: ' + await ids());
  assert(await page.evaluate(() => { const m = (JSON.parse(localStorage.getItem('belegbuch:settings')).find(x => x.id === 'geloescht') || {}).map || {}; return Object.keys(m).some(k => k.startsWith('belege/l')) && !m['belege/x2']; }), 'Löschmarken: Hornbach markiert, Famila nicht mehr');
  await nav(page, 'sicherung'); await page.click('[data-act="restore-undo"]'); await page.waitForTimeout(400);
  assert(await ids() === 'Hornbach, Würth', 'nach Rückgängig: ' + await ids());
  assert(await page.$eval('#restoreUndo', x => x.hidden), 'Rückgängig-Knopf ist danach weg');
  await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' }); assert(await ids() === 'Hornbach, Würth', 'Stand bleibt nach Neuladen: ' + await ids());
  console.log('Fehler: ' + (errs.join('|') || 'keine')); await b.close();
})();
