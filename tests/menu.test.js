// Startmenü: 10 Kacheln (eigene Kachel „Aufmaß“), Zähler, Zurück-Knopf und Zurück-Taste des Geräts (Verlauf).
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  const tiles = await page.$$eval('#menuGrid .mtile b', t => t.map(x => x.textContent.replace(/­/g, '')));
  assert(tiles.length === 10 && tiles[0] === 'Termine & Erledigen' && tiles[3] === 'Aufmaß' && tiles[9] === 'Datensicherung', 'Menü mit 10 Kacheln, „Aufmaß“ nach „Baustellen & Material“, „Termine & Erledigen“ zuerst, „Datensicherung“ zuletzt');
  assert(await page.isHidden('#backBtn') && await page.isHidden('#fab'), 'im Menü kein Zurück-Knopf und kein +');
  await page.click('.mtile[data-tab="belege"]');
  assert(await page.textContent('#pageTitle') === 'Kosten & Fahrten' && await page.isVisible('#backBtn') && await page.isVisible('#fab'), 'Kachel öffnet „Kosten & Fahrten“ mit Zurück-Knopf und +');
  await page.click('#backBtn'); await page.waitForSelector('#v-menu:not([hidden])');
  assert(await page.textContent('#pageTitle') === 'FFH Bau und Büro', 'Zurück-Knopf führt ins Menü');
  await page.click('.mtile[data-tab="rechnungen"]'); await page.click('#v-rechnungen .seg [data-tab="angebote"]');
  assert(await page.isVisible('#v-angebote') && await page.textContent('#pageTitle') === 'Rechnungen & Angebote', 'Umschalter Rechnungen/Angebote');
  await page.goBack(); await page.waitForSelector('#v-menu:not([hidden])');
  assert(true, 'Zurück-Taste des Geräts führt ins Menü');
  await page.click('.mtile[data-act="menu-aufmass"]');
  assert(await page.textContent('#pageTitle') === 'Aufmaß' && await page.textContent('#fab') === '+ Aufmaß' && await page.isVisible('#fa-seg [data-kind="aufmass"][aria-pressed="true"]'), 'Kachel „Aufmaß“ öffnet die Aufmaß-Übersicht mit „+ Aufmaß“');
  await page.click('#fab'); await page.waitForSelector('#sheet:not([hidden])');
  assert(/Aufmaß/.test(await page.textContent('#sheetTitle')), '„+ Aufmaß“ startet ein neues Aufmaß');
  await page.keyboard.press('Escape'); await page.click('[data-act="cancel"]').catch(() => {}); await page.click('#backBtn').catch(() => {}); await page.waitForSelector('#v-menu:not([hidden])');
  await page.click('.mtile[data-tab="auftraege"]');
  assert(await page.textContent('#pageTitle') === 'Baustellen & Material' && await page.textContent('#fab') === '+ Auftrag', 'danach öffnet „Baustellen & Material“ wieder die Baustellen-Liste');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
