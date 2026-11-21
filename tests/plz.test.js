// PLZ im Angebot: fehlende Postleitzahl online ergänzen (Netz nachgestellt), mehrere Treffer zur Wahl,
// eigenes Bundesland zuerst, ohne Treffer oder Netz selbst eintragen.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let down = false; const asked = [];
  await page.route('**/*', r => {
    const u = r.request().url();
    if (/^(file|blob):/.test(u)) return r.continue();
    if (/openplzapi\.org/.test(u)) {
      asked.push(u); if (down) return r.abort();
      const q = new URL(u), json = x => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(x) });
      if (q.pathname === '/de/Streets') return json(q.searchParams.get('locality') === 'Zarrendorf' && q.searchParams.get('name') === 'Lindenweg' ? [{ name: 'Lindenweg', postalCode: '18510', locality: 'Zarrendorf', federalState: { name: 'Mecklenburg-Vorpommern' } }] : []);
      if (q.pathname === '/de/Localities') {
        const n = q.searchParams.get('name');
        return json(n === 'Steinhagen' ? [{ name: 'Steinhagen', postalCode: '33803', federalState: { name: 'Nordrhein-Westfalen' } }, { name: 'Steinhagen', postalCode: '18442', federalState: { name: 'Mecklenburg-Vorpommern' } }]
          : n === 'Neustadt' ? [{ name: 'Neustadt', postalCode: '01844', federalState: { name: 'Sachsen' } }, { name: 'Neustadt', postalCode: '16845', federalState: { name: 'Brandenburg' } }] : []);
      }
    }
    if (/nominatim/.test(u)) { asked.push(u); return down ? r.abort() : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }); }
    return r.abort();
  });
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.click('.mtile[data-tab="rechnungen"]'); await page.click('#v-rechnungen .seg [data-tab="angebote"]'); await page.click('#fab'); await page.waitForSelector('#a-address');
  const type = async (id, v) => { await page.fill('#' + id, v); await page.press('#' + id, 'Tab'); await page.waitForFunction(id => !/wird gesucht/.test(document.querySelector('#plz-' + id).textContent), id); };
  await type('a-address', 'Lindenweg 2, Zarrendorf');
  assert(await page.inputValue('#a-address') === 'Lindenweg 2, 18510 Zarrendorf' && /PLZ 18510 online ergänzt/.test(await page.textContent('#plz-a-address')), 'eindeutige PLZ eingesetzt (Straße + Ort)');
  await page.click('.stepper [data-step="4"]').catch(() => {});
  await type('a-site', 'Am Teich 4 Steinhagen');
  assert(await page.inputValue('#a-site') === 'Am Teich 4, 18442 Steinhagen' && /33803 Steinhagen/.test(await page.textContent('#plz-a-site')), 'gleicher Ortsname: eigenes Bundesland (MV) gewählt, anderer als Knopf');
  await page.click('#plz-a-site [data-act="plz-pick"]');
  assert(await page.inputValue('#a-site') === 'Am Teich 4, 33803 Steinhagen', 'anderen Ort antippen setzt dessen PLZ');
  await type('a-site', 'Markt 1, Neustadt');
  assert(await page.inputValue('#a-site') === 'Markt 1, Neustadt' && (await page.$$('#plz-a-site [data-act="plz-pick"]')).length === 2, 'mehrere Treffer außerhalb MV: Auswahl, nichts automatisch');
  await type('a-site', 'Hauptstr. 3, Nirgendwo');
  assert(/Keine PLZ/.test(await page.textContent('#plz-a-site')) && await page.isVisible('#plzin-a-site'), 'kein Treffer: selbst eintragen');
  await page.fill('#plzin-a-site', '18519'); await page.click('#plz-a-site [data-act="plz-manual"]');
  assert(await page.inputValue('#a-site') === 'Hauptstr. 3, 18519 Nirgendwo', 'eigene PLZ eingefügt');
  down = true;
  await type('a-address', 'Dorfstraße 1, Prohn');
  assert(/nicht erreichbar|Ohne Internet/.test(await page.textContent('#plz-a-address')) && await page.isVisible('#plzin-a-address'), 'ohne Netz: Hinweis und Feld zum Selbsteintragen');
  await type('a-address', 'Dorfstraße 1, 18445 Prohn');
  assert(await page.textContent('#plz-a-address') === '', 'mit PLZ: keine Suche');
  assert(await page.evaluate(() => true), 'Daten: ' + asked.length + ' Anfragen');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
