// Startmenü: 9 Kacheln, Zähler, Zurück-Knopf und Zurück-Taste des Geräts (Verlauf).
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  const tiles = await page.$$eval('#menuGrid .mtile b', t => t.map(x => x.textContent.replace(/­/g, '')));
  assert(tiles.length === 9 && tiles[0] === 'Zu erledigen' && tiles[8] === 'Datensicherung', 'Menü mit 9 Kacheln, „Zu erledigen“ zuerst, „Datensicherung“ zuletzt');
  assert(await page.isHidden('#backBtn') && await page.isHidden('#fab'), 'im Menü kein Zurück-Knopf und kein +');
  await page.click('.mtile[data-tab="belege"]');
  assert(await page.textContent('#pageTitle') === 'Kosten & Fahrten' && await page.isVisible('#backBtn') && await page.isVisible('#fab'), 'Kachel öffnet „Kosten & Fahrten“ mit Zurück-Knopf und +');
  await page.click('#backBtn'); await page.waitForSelector('#v-menu:not([hidden])');
  assert(await page.textContent('#pageTitle') === 'Belegbuch', 'Zurück-Knopf führt ins Menü');
  await page.click('.mtile[data-tab="rechnungen"]'); await page.click('#v-rechnungen .seg [data-tab="angebote"]');
  assert(await page.isVisible('#v-angebote') && await page.textContent('#pageTitle') === 'Rechnungen & Angebote', 'Umschalter Rechnungen/Angebote');
  await page.goBack(); await page.waitForSelector('#v-menu:not([hidden])');
  assert(true, 'Zurück-Taste des Geräts führt ins Menü');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
