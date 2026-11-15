const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const doc = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'richtwerte.json'), 'utf8'));
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route('**/*', r => { const u = r.request().url(); return (u.startsWith('file:') || u.includes('cdnjs.cloudflare.com')) ? r.continue() : r.abort(); });
  await page.addInitScript(d => { try { if (!localStorage.getItem('belegbuch:settings')) localStorage.setItem('belegbuch:settings', JSON.stringify([Object.assign({ id: 'richtwerte' }, d)])); } catch (e) {} }, doc);
  await page.goto(APP);
  await page.addStyleTag({ content: '[hidden]{display:none!important} body{margin:0}' });
  await page.waitForFunction(() => document.querySelector('#mode').textContent.includes('Gerät'));
  console.log('jsPDF geladen:', await page.evaluate(() => !!(window.jspdf && window.jspdf.jsPDF)));
  const card = t => page.locator('#auftraegeList article.row', { hasText: t });
  const closed = () => page.waitForSelector('#sheet', { state: 'hidden' });

  // Firma und Preise
  await page.click('[data-act="settings"]');
  for (const [k, v] of [['name', 'Mustermann Fliesen'], ['owner', 'Max Mustermann'], ['street', 'Hafenstr. 1'], ['city', '18439 Stralsund'], ['taxid', '079/123/45678'], ['iban', 'DE02 1203 0000 0000 2020 51']]) await page.fill('#s-' + k, v);
  await page.fill('#p-verl-std', '50'); await page.fill('#pp-verl-std', '65');
  await page.click('[data-act="set-save"]'); await closed();

  // Baustelle A (Firma)
  await page.click('[data-act="tab"][data-tab="auftraege"]'); await page.click('#fab');
  await page.fill('#f-title', 'Bad EG'); await page.fill('#f-party', 'Hotel Strandblick'); await page.fill('#f-site', 'Strandpromenade 3, Binz');
  await page.fill('#f-addr', 'Strandpromenade 3, 18609 Binz'); await page.fill('#f-email', 'info@hotel.example');
  await page.click('[data-act="save"]'); await closed();
  await card('Bad EG').locator('[data-act="aufmass"]').click();
  await page.fill('#amBody .pos[data-i="0"] [data-f="l"]', '4'); await page.fill('#amBody .pos[data-i="0"] [data-f="b"]', '3');
  await page.click('[data-act="am-save"]'); await closed();
  await card('Bad EG').locator('[data-act="angebot"]').click();
  console.log('Angebot Firma Preis:', await page.inputValue('#angBody .pos[data-i="0"] [data-pf="price"]'), '| Menge:', await page.inputValue('#angBody .pos[data-i="0"] [data-pf="qty"]'));
  console.log('Summen Firma:', (await page.textContent('#angTotals')).replace(/\s+/g, ' ').slice(0, 260));
  await page.click('[data-act="ang-sent"]'); await closed();

  // Aufmaß ändern
  await card('Bad EG').locator('[data-act="aufmass"]').click();
  await page.fill('#amBody .pos[data-i="0"] [data-f="l"]', '5'); await page.click('[data-act="am-save"]'); await closed();

  // Rechnung
  await card('Bad EG').locator('[data-act="rechnung"]').click();
  console.log('Rechnung Menge:', await page.inputValue('#angBody .pos[data-i="0"] [data-pf="qty"]'), '|', (await page.textContent('#angBody .pos[data-i="0"] .sub')).replace(/\s+/g, ' ').slice(0, 120));
  console.log('Annex aktiv:', await page.isChecked('#r-annex'), '| Fällig:', await page.inputValue('#r-due'));
  await page.click('[data-act="re-pdf"]'); await page.waitForTimeout(400);
  await page.click('[data-act="re-issue"]');
  console.log('Nach 1. Klick:', (await page.textContent('[data-act="re-issue"]')).trim());
  await page.click('[data-act="re-issue"]'); await page.waitForTimeout(300);
  console.log('Titel:', (await page.textContent('#sheetTitle')).replace(/\s+/g, ' '));
  console.log('Felder gesperrt:', await page.$eval('#r-name', e => e.disabled), '| Preis-Feld gesperrt:', await page.$eval('#angBody .pos[data-i="0"] [data-pf="price"]', e => e.disabled));
  await page.click('[data-act="re-pdf"]'); await page.waitForTimeout(400);
  await page.click('[data-act="re-paid"]'); await page.waitForTimeout(300);
  console.log('Status nach bezahlt:', (await page.textContent('#sheetTitle')).replace(/\s+/g, ' '));
  await page.click('[data-act="cancel"]'); await closed();
  await page.click('[data-act="tab"][data-tab="rechnungen"]');
  await page.click('[data-act="re-storno-list"]'); await page.waitForTimeout(300);
  console.log('Storno armed:', (await page.textContent('[data-act="re-storno"]')).trim());
  await page.click('[data-act="re-storno"]'); await page.waitForTimeout(300);
  console.log('Nach Storno:', (await page.textContent('#sheetTitle')).replace(/\s+/g,' '), '| Storno-Button noch da:', await page.$('[data-act="re-storno"]') !== null);
  await page.click('[data-act="re-pdf"]'); await page.waitForTimeout(200);
  await page.click('[data-act="cancel"]'); await closed();
  await page.click('[data-act="tab"][data-tab="auftraege"]');
  console.log('DBG tab:', await page.evaluate(() => [...document.querySelectorAll('section')].filter(s => !s.hidden).map(s => s.id).join(',')), '| list:', (await page.textContent('#auftraegeList')).replace(/\s+/g,' ').slice(0,200));
  await page.click('[data-act="tab"][data-tab="auftraege"]');
  if (await page.isChecked('#fa-open')) await page.uncheck('#fa-open');
  console.log('Baustelle A:', (await card('Bad EG').textContent()).replace(/\s+/g, ' ').slice(0, 110));

  // Baustelle B (Privat)
  await page.click('#fab');
  await page.fill('#f-title', 'Gäste-WC'); await page.fill('#f-party', 'Familie Meyer'); await page.fill('#f-site', 'Stralsund, Mühlenstr. 2');
  await page.selectOption('#f-ckind', 'privat');
  await page.click('[data-act="save"]'); await closed();
  await card('Gäste-WC').locator('[data-act="aufmass"]').click();
  await page.fill('#amBody .pos[data-i="0"] [data-f="l"]', '2'); await page.fill('#amBody .pos[data-i="0"] [data-f="b"]', '1,5');
  await page.click('[data-act="am-save"]'); await closed();
  await card('Gäste-WC').locator('[data-act="angebot"]').click();
  console.log('Angebot Privat Preis:', await page.inputValue('#angBody .pos[data-i="0"] [data-pf="price"]'), '| Art-Feld:', await page.$$eval('#angBody [data-pf="art"]', e => e.length));
  console.log('Summen Privat:', (await page.textContent('#angTotals')).replace(/\s+/g, ' ').slice(0, 300));
  await page.selectOption('#a-ckind', 'firma');
  console.log('Preis nach Wechsel auf Firma:', await page.inputValue('#angBody .pos[data-i="0"] [data-pf="price"]'));
  await page.selectOption('#a-ckind', 'privat');
  await page.click('[data-act="cancel"]'); await closed();

  await page.click('[data-act="tab"][data-tab="rechnungen"]');
  console.log('Rechnungen:', (await page.textContent('#rechnungenSum')).replace(/\s+/g, ' '), '|', (await page.textContent('#rechnungenList')).replace(/\s+/g, ' ').slice(0, 140));
  await page.click('[data-act="tab"][data-tab="uebersicht"]');
  console.log('Kacheln:', (await page.textContent('#tiles')).replace(/\s+/g, ' ').slice(0, 260));
  console.log('Overflow:', await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
  console.log('Fehler:', errs.length ? errs.join('\n') : 'keine');
  await b.close();
})();
