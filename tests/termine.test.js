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
  // Baustelle: neuer Name frei eintragen
  await page.click('#fab'); await page.fill('#t-title', 'Besichtigung'); await page.fill('#t-date', iso(3)); await page.fill('#t-site', 'Küche Schulz');
  assert(/Neuer Name/.test(await page.textContent('#t-sitehint')), 'Hinweis: neuer Baustellenname');
  await page.click('#form [data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  assert(/Baustelle Küche Schulz/.test(await page.textContent('#termBox')), 'frei benannte Baustelle steht beim Termin');
  // Baustelle: vorhandene über den Namen verknüpfen, Ort wird übernommen
  await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('belegbuch:auftraege') || '[]'); a.push({ id: 'b1', kind: 'kunde', title: 'Bad EG Meier', party: 'Meier', site: 'Lindenweg 2, 18510 Zarrendorf', status: 'In Arbeit', amount: 0, _t: 1 }); localStorage.setItem('belegbuch:auftraege', JSON.stringify(a)); });
  await page.reload(); await page.waitForSelector('#termBox .row');
  await page.click('#fab'); await page.fill('#t-title', 'Fugen'); await page.fill('#t-date', iso(4)); await page.fill('#t-site', 'bad eg meier');
  assert(/Verknüpft mit der Baustelle „Bad EG Meier“ \(Meier\)/.test(await page.textContent('#t-sitehint')) && await page.inputValue('#t-place') === 'Lindenweg 2, 18510 Zarrendorf', 'vorhandene Baustelle erkannt, Ort übernommen');
  await page.click('#form [data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:termine')).some(t => t.title === 'Fugen' && t.auftragId === 'b1' && !t.baustelle)), 'Termin mit der Baustelle verknüpft');
  const rows = await page.$$eval('#termBox > .list .row .vendor', x => x.map(e => e.textContent));
  assert(rows.join('|') === 'Aufmaß Bad|Besichtigung|Fugen|Fliesen abholen', 'anstehende Termine nach Datum sortiert: ' + rows.join('|'));
  assert(/Vergangene Termine \(1\)/.test(await page.textContent('#termBox summary')), 'vergangener Termin eingeklappt');
  assert(/Morgen: 8:30 Aufmaß Bad/.test(await page.textContent('#remindBox')), 'Kachel zeigt die Termine von morgen neben der Belege-Erinnerung');
  // Ohne „Worum geht es?“: Termin heißt nach Baustelle bzw. „Termin“
  await page.click('#fab'); await page.fill('#t-date', iso(6)); await page.fill('#t-site', 'Gäste-WC Lange'); await page.click('#form [data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:termine')).some(t => t.title === 'Termin Gäste-WC Lange')), 'ohne Titel gespeichert: „Termin Gäste-WC Lange“');
  await page.click('#fab'); await page.fill('#t-date', ''); await page.click('#form [data-act="save"]');
  assert(/Datum/.test(await page.textContent('#formErr')), 'ohne Datum: verständliche Meldung');
  await page.click('#form [data-act="cancel"]');
  await page.click('#termBox article:has-text("Termin Gäste-WC Lange")'); await page.click('#form [data-act="delete"]'); await page.click('#form [data-act="delete"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  // Eigene Erinnerung: 2 Stunden vorher, genauer Zeitpunkt, ICS-Alarm
  await page.click('#fab'); await page.fill('#t-title', 'Fliesen anliefern'); await page.fill('#t-date', iso(2)); await page.fill('#t-time', '10:00');
  await page.selectOption('#t-remind', 'eigen');
  assert(await page.isVisible('#t-rbefore'), '„Eigene Zeit wählen …“ zeigt die Auswahl');
  await page.selectOption('#t-rbefore', '120');
  assert(/um 8:00 Uhr/.test(await page.textContent('#t-rtext')), 'Zeitpunkt wird genannt: ' + await page.textContent('#t-rtext'));
  await page.click('#form [data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  let tx = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:termine')).find(t => t.title === 'Fliesen anliefern'));
  assert(tx.remind === 'eigen' && tx.remindBefore === '120' && /T08:00$/.test(tx.remindAt), 'gespeichert: 2 Stunden vorher → ' + tx.remindAt);
  assert(/⏰/.test(await page.textContent('#termBox article:has-text("Fliesen anliefern")')), 'Liste zeigt die eigene Erinnerung');
  await page.click('#termBox article:has-text("Fliesen anliefern")'); await page.waitForSelector('#t-rbefore');
  await page.selectOption('#t-rbefore', 'abs');
  assert(await page.isVisible('#t-rat') && /T08:00$/.test(await page.inputValue('#t-rat')), 'genauer Zeitpunkt: Feld mit dem bisherigen Zeitpunkt vorbelegt');
  await page.fill('#t-rat', iso(1) + 'T18:30'); await page.dispatchEvent('#t-rat', 'input');
  assert(/18:30 Uhr/.test(await page.textContent('#t-rtext')), 'freier Zeitpunkt angezeigt');
  await page.click('#form [data-act="save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  tx = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:termine')).find(t => t.title === 'Fliesen anliefern'));
  assert(tx.remindBefore === 'abs' && /T18:30$/.test(tx.remindAt), 'gespeichert: ' + tx.remindAt);
  await page.click('#termBox article:has-text("Fliesen anliefern")'); await page.waitForSelector('[data-act="term-ics"]');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="term-ics"]')]);
  const ics2 = fs.readFileSync(await dl2.path(), 'utf8');
  assert((ics2.match(/BEGIN:VALARM/g) || []).length === 1 && /TRIGGER;VALUE=DATE-TIME:\d{8}T\d{6}Z/.test(ics2), 'Kalender-Datei: genau ein Alarm zur gewählten Zeit');
  await page.click('#form [data-act="delete"]'); await page.click('#form [data-act="delete"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
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
  assert((await page.$$('#termBox > .list .row')).length === 3, 'Termin gelöscht');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:termine')).length === 4), 'Termine liegen im Speicher (und damit in Sicherung und Abgleich)');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
