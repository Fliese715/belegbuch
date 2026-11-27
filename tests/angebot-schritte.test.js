// Angebot in vier Schritten: aus der Angebotsliste neu anlegen, Kunde aus der Kartei, neue Baustelle wird angelegt,
// Fehlermeldungen springen zum passenden Schritt, Positionen als Karten.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => localStorage.setItem('belegbuch:kunden', JSON.stringify([{ id: 'k1', name: 'Firma Nordbau GmbH', ckind: 'firma', address: 'Hafenstraße 1, 18439 Stralsund', email: 'info@nordbau.test', phone: '', note: '', _t: 1 }])));
  await page.reload(); await page.waitForSelector('.mtile');
  await page.click('.mtile[data-tab="rechnungen"]'); await page.click('#v-rechnungen .seg [data-tab="angebote"]');
  assert(await page.textContent('#fab') === '+ Angebot', 'Knopf „+ Angebot“ in der Angebotsliste');
  await page.click('#fab');
  assert(await page.isVisible('.angstep[data-step="1"]') && await page.isHidden('.angstep[data-step="2"]'), 'neues Angebot startet bei Schritt 1 „Kunde“');
  await page.click('.stepnav .next');
  assert(/Bitte zuerst den Kunden/.test(await page.textContent('#formErr')) && await page.isVisible('.angstep[data-step="1"]'), 'ohne Kunden kein Weiter');
  await page.fill('#a-bs', 'Treppenhaus Nordbau'); await page.dispatchEvent('#a-bs', 'change');
  assert(/Neue Baustelle/.test(await page.textContent('#a-bshint')), 'Hinweis: neue Baustelle');
  await page.fill('#a-name', 'Firma Nordbau GmbH'); await page.dispatchEvent('#a-name', 'change');
  assert(await page.inputValue('#a-email') === 'info@nordbau.test' && await page.inputValue('#a-address') === 'Hafenstraße 1, 18439 Stralsund' && await page.inputValue('#a-ckind') === 'firma', 'Kundendaten aus der Kartei übernommen');
  assert(await page.inputValue('#a-title') === 'Fliesenarbeiten Treppenhaus Nordbau', 'Betreff aus dem Baustellennamen');
  await page.click('.stepnav .next');
  assert(await page.isVisible('.angstep[data-step="2"]') && /Noch keine Leistung/.test(await page.textContent('.angstep[data-step="2"]')), 'Schritt 2 „Leistungen“, noch leer');
  await page.click('.stepper [data-step="4"]'); await page.click('[data-act="ang-save"]');
  assert(await page.isVisible('.angstep[data-step="2"]') && /mindestens eine Leistung/.test(await page.textContent('#formErr')), 'Speichern ohne Leistung springt zu Schritt 2');
  await page.selectOption('#angAdd', 'stunde'); await page.fill('#angBody .pos[data-i="0"] [data-pf="qty"]', '8');
  await page.click('[data-act="ang-free"]');
  assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('.pos[data-i="1"] textarea')), 'freie Position: Cursor steht im Leistungstext');
  await page.fill('#angBody .pos[data-i="1"] [data-pf="text"]', 'Anfahrt Stralsund'); await page.fill('#angBody .pos[data-i="1"] [data-pf="price"]', '40');
  await page.click('[data-act="ang-psch"]');
  assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('.pos[data-i="2"] [data-pf="price"]')) && await page.inputValue('#angBody .pos[data-i="2"] [data-pf="unit"]') === 'psch' && /pauschal laut Vorgabe/.test(await page.inputValue('#angBody .pos[data-i="2"] textarea')), '„+ Pauschalpreis“: 1 psch, Cursor steht im Preis');
  await page.click('#angBody .pos[data-i="2"] [data-act="ang-del-pos"]');
  const head = await page.textContent('#angSumHead');
  assert(/netto/.test(head) && (await page.$$('#angBody .pos.pcard')).length === 2, 'zwei Positionskarten, Summe im Kopf: ' + head);
  const wide = await page.evaluate(() => document.querySelector('#sheetBody').scrollWidth > document.querySelector('#sheetBody').clientWidth + 1);
  assert(!wide, 'kein seitliches Scrollen bei 400 px');
  await page.click('.stepnav .next'); await page.click('.stepnav .next');
  assert(/Firma Nordbau GmbH/.test(await page.textContent('.overview')) && /2 Positionen/.test(await page.textContent('.overview')) && await page.isVisible('[data-act="ang-sent"]'), 'Schritt 4: Übersicht und Versand');
  await page.click('[data-act="ang-save"]'); await page.waitForSelector('#sheet', { state: 'hidden' });
  const d = await page.evaluate(() => ({ a: JSON.parse(localStorage.getItem('belegbuch:auftraege') || '[]'), g: JSON.parse(localStorage.getItem('belegbuch:angebote') || '[]'), k: JSON.parse(localStorage.getItem('belegbuch:kunden') || '[]') }));
  assert(d.a.length === 1 && d.a[0].title === 'Treppenhaus Nordbau' && d.a[0].status === 'Anfrage' && d.g[0].auftragId === d.a[0].id, 'Baustelle „Treppenhaus Nordbau“ angelegt und mit dem Angebot verknüpft');
  assert(d.k.length === 1, 'kein doppelter Kunde in der Kartei');
  // Wieder öffnen: Entwurf startet bei den Leistungen
  await page.click('#angeboteList .row');
  assert(await page.isVisible('.angstep[data-step="2"]') && await page.isHidden('#a-bs'), 'Entwurf öffnet bei Schritt 2, Baustelle fest verknüpft');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
