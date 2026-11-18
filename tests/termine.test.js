// Termine: anlegen, sortieren, Hinweise (Feiertag, Urlaub), Kalender-Datei, Google-Link, Menü und Abend-Kachel.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
const fs = require('fs');
async function nav(p, t) {
  if (await p.isVisible('#backBtn')) { await p.click('#backBtn'); }
  await p.click(t === 'settings' ? '.mtile[data-act="settings"]' : '.mtile[data-tab="' + t + '"]');
}
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, acceptDownloads: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await nav(page, 'erledigen');
  assert(await page.textContent('#fab') === '+ Termin', 'Knopf „+ Termin“ auf der Seite Termine & Erledigen');
  const add = async (title, date, time, extra) => {
    await page.click('#fab'); await page.fill('#t-title', title); await page.fill('#t-date', date); if (time) await page.fill('#t-time', time);
    if (extra) await extra();
    await page.click('#form [data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  };
  await add('Fliesen abholen', iso(5), '');
  await add('Aufmaß Bad', iso(1), '08:30', async () => { await page.fill('#t-place', 'Dorfstraße 3, 18510 Zarrendorf'); await page.selectOption('#t-remind', 'abend'); });
  await add('Alter Termin', iso(-3), '10:00');
  const rows = await page.$$eval('#termBox > .list .row .vendor', x => x.map(e => e.textContent));
  assert(rows.join('|') === 'Aufmaß Bad|Fliesen abholen', 'anstehende Termine nach Datum sortiert: ' + rows.join('|'));
  assert(/Vergangene Termine \(1\)/.test(await page.textContent('#termBox summary')), 'vergangener Termin eingeklappt');
  assert(/Morgen: 8:30 Aufmaß Bad/.test(await page.textContent('#remindBox')), 'Kachel zeigt die Termine von morgen neben der Belege-Erinnerung');
  // Hinweis Feiertag + Urlaub
  const y = new Date().getFullYear() + 1;
  await page.evaluate(y => { const a = JSON.parse(localStorage.getItem('belegbuch:abwesenheit') || '[]'); a.push({ id: 'u1', type: 'urlaub', from: y + '-12-24', to: y + '-12-31', _t: 1 }); localStorage.setItem('belegbuch:abwesenheit', JSON.stringify(a)); }, y);
  await page.reload(); await page.waitForSelector('#termBox .row');
  await page.click('#fab'); await page.fill('#t-date', y + '-12-25');
  const warn = await page.textContent('#t-warn');
  assert(/1\. Weihnachtstag/.test(warn) && /Urlaub eingetragen/.test(warn), 'Hinweis: ' + warn);
  await page.click('#form [data-act="cancel"]');
  // Kalender-Datei
  await page.click('#termBox > .list .row:first-child');
  const href = await page.getAttribute('.calrow a', 'href');
  assert(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Aufma%C3%9F%20Bad&dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/.test(href) && /location=Dorfstra/.test(href), 'Google-Kalender-Link');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="term-ics"]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  assert(/^termin-\d{4}-\d{2}-\d{2}-aufmass-bad\.ics$/.test(dl.suggestedFilename()), 'Dateiname ' + dl.suggestedFilename());
  assert(/BEGIN:VEVENT[\s\S]*SUMMARY:Aufmaß Bad[\s\S]*LOCATION:Dorfstraße 3\\, 18510 Zarrendorf/.test(ics), 'ICS enthält Titel und Ort');
  assert((ics.match(/BEGIN:VALARM/g) || []).length === 2 && /TRIGGER:-PT1H/.test(ics), 'ICS: Vorabend-Alarm und 1 Stunde vorher (Einstellung „nur Vorabend“)');
  await page.click('#form [data-act="cancel"]');
  // Menü
  await page.click('#backBtn'); await page.waitForSelector('#v-menu:not([hidden])');
  assert(/nächster: Morgen 8:30/.test(await page.textContent('.mtile[data-tab="erledigen"] small')), 'Menükachel zeigt den nächsten Termin');
  // Löschen
  await nav(page, 'erledigen'); await page.click('#termBox > .list .row:first-child'); await page.click('[data-act="delete"]'); await page.click('[data-act="delete"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  assert((await page.$$('#termBox > .list .row')).length === 1, 'Termin gelöscht');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:termine')).length === 2), 'Termine liegen im Speicher (und damit in Sicherung und Abgleich)');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
