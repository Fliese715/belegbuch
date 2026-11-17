const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// Abschlagsrechnungen, Schlussrechnung mit Abzug, echte Stornorechnung, Zahlungserinnerung und Mahnungen.
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
const Y = String(new Date().getFullYear());
const days = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.evaluate(Y => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'Test Fliesen', owner: 'Max Test', street: 'Musterweg 1', city: '18439 Stralsund', taxid: '123/456/78901', iban: 'DE00 0000 0000 0000 0000 00', kleinunt: false }, { id: 'preise', region: 0, own: { 'verl-std': 200, stunde: 50 }, ownPrivat: {} }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', ckind: 'firma', title: 'Bad EG', party: 'Bau GmbH', address: 'Hafenstraße 1, 18439 Stralsund', site: 'Lindenweg 12', amount: 2000, status: 'In Arbeit', date: Y + '-02-01', due: Y + '-12-31', terms: 14, aufmass: { rows: [{ room: 'Bad', type: 'boden', l: '5', b: '2', n: '1', abz: '' }], waste: 10 } }]));
  }, Y);
  await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  const card = () => page.textContent('#auftraegeList article:has-text("Bad EG")');
  const issue = async () => { await page.click('[data-act="re-issue"]'); await page.click('[data-act="re-issue"]'); await page.waitForFunction(() => /gestellt|Gestellt/.test(document.querySelector('#sheetTitle').textContent)); };
  async function abschlag(price) {
    await page.click('[data-act="tab"][data-tab="auftraege"]'); await page.click('#auftraegeList article:has-text("Bad EG") [data-act="abschlag"]'); await page.waitForSelector('#angBody');
    await page.fill('#angBody tbody.pos input[data-pf="price"]', price); await page.press('#angBody tbody.pos input[data-pf="price"]', 'Tab');
    await issue(); const t = (await page.textContent('#sheetTitle')).replace(/\s+/g, ' '); await page.click('#sheet [data-act="cancel"]'); return t;
  }
  // 1. Abschlag ohne Betrag wird abgelehnt
  await page.click('[data-act="tab"][data-tab="auftraege"]'); await page.click('#auftraegeList article:has-text("Bad EG") [data-act="abschlag"]'); await page.waitForSelector('#angBody');
  await page.click('[data-act="re-issue"]'); assert(/Betrag des Abschlags/.test(await page.textContent('#formErr')), 'Abschlag ohne Betrag wird abgelehnt');
  await page.click('#sheet [data-act="cancel"]');
  const t1 = await abschlag('1000'); assert(new RegExp('Abschlagsrechnung R-' + Y + '-001').test(t1), 'erste Abschlagsrechnung: ' + t1);
  const t2 = await abschlag('500'); assert(new RegExp('Abschlagsrechnung R-' + Y + '-002').test(t2), 'zweite Abschlagsrechnung: ' + t2);
  assert(/2 Abschlagsrechnungen · 1\.785,00/.test(await card()) && /Schlussrechnung/.test(await card()), 'Karte: 2 Abschläge 1.785,00 €, Knopf „Schlussrechnung“');
  // Schlussrechnung
  await page.click('#auftraegeList article:has-text("Bad EG") [data-act="rechnung"]'); await page.waitForSelector('#angTotals');
  const tot = (await page.textContent('#angTotals')).replace(/\s+/g, ' ');
  assert(/Neue Schlussrechnung/.test(await page.textContent('#sheetTitle')) && /abzüglich Abschlagsrechnung R-\d{4}-001.*-1\.190,00.*abzüglich Abschlagsrechnung R-\d{4}-002.*-595,00.*Noch zu zahlen\s*595,00/.test(tot), 'Schlussrechnung zieht beide Abschläge ab: ' + tot.slice(-150));
  await issue(); const sr = (await page.textContent('#sheetTitle')).replace(/\s+/g, ' ');
  assert(new RegExp('Schlussrechnung R-' + Y + '-003').test(sr), 'Schlussrechnung gestellt: ' + sr);
  assert(/über 595,00\s€/.test(await page.inputValue('#mailBody')), 'E-Mail-Text nennt den Restbetrag');
  await page.click('#sheet [data-act="cancel"]');
  assert(!/data-act="abschlag"/.test(await page.innerHTML('#auftraegeList article:has-text("Bad EG")')), 'nach der Schlussrechnung kein Abschlag-Knopf mehr');
  await page.click('[data-act="tab"][data-tab="uebersicht"]');
  assert(/2\.380,00/.test(await page.textContent('#tiles .tile[data-go="inv"]')), 'Übersicht: offen 1.190 + 595 + 595 = 2.380,00 €');
  // Storno des zweiten Abschlags
  await page.click('[data-act="tab"][data-tab="rechnungen"]');
  await page.click('#rechnungenList article:has-text("-002") [data-act="re-storno-list"]'); await page.waitForTimeout(300);
  await page.click('[data-act="re-storno"]'); await page.waitForFunction(() => /Stornorechnung/.test(document.querySelector('#sheetTitle').textContent));
  const st = (await page.textContent('#sheetTitle')).replace(/\s+/g, ' ');
  assert(new RegExp('Stornorechnung R-' + Y + '-004').test(st) && /-595,00/.test(await page.textContent('#angTotals')), 'Stornorechnung mit eigener Nummer und -595,00 €: ' + st);
  assert(!(await page.$('[data-act="re-storno"]')), 'Stornorechnung selbst lässt sich nicht stornieren');
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:rechnungen')).map(x => [x.nr, x.type || 'rechnung', x.status, x.stornoNr || x.stornoOfNr || ''].join(':')).sort().join(' '));
  assert(data === `R-${Y}-001:abschlag:Gestellt: R-${Y}-002:abschlag:Storniert:R-${Y}-004 R-${Y}-003:schluss:Gestellt: R-${Y}-004:storno:Storno:R-${Y}-002`, 'Datenstand: ' + data);
  await page.click('#sheet [data-act="cancel"]');
  assert(/Stornorechnung/.test(await page.textContent('#rechnungenList article:has-text("-004")')), 'Liste kennzeichnet die Stornorechnung');
  // Mahnwesen an der Schlussrechnung (Firmenkunde)
  const setRe = fn => page.evaluate(([fn]) => { const r = JSON.parse(localStorage.getItem('belegbuch:rechnungen')); const x = r.find(y => y.type === 'schluss'); new Function('x', fn)(x); localStorage.setItem('belegbuch:rechnungen', JSON.stringify(r)); }, [fn]);
  await setRe(`x.due = '${days(-5)}'`); await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.click('[data-act="tab"][data-tab="uebersicht"]');
  assert(/R-\d{4}-003 · Bau GmbH: Zahlungserinnerung fällig/.test(await page.textContent('#todo')), 'Zu erledigen: Zahlungserinnerung fällig');
  await page.click('#todo [data-act="re-open"]'); await page.waitForSelector('#mahnBox');
  let mb = (await page.textContent('#mahnBox')).replace(/\s+/g, ' ');
  assert(/Zahlungserinnerung fällig/.test(mb) && !/Mahngebühr/.test(mb) && /Zu zahlen bis .*595,00/.test(mb), 'Zahlungserinnerung ohne Gebühr, 595,00 €');
  assert(/sicher ist es Ihrer Aufmerksamkeit entgangen/.test(await page.inputValue('#mahnTextIn')), 'Vorschlagstext Zahlungserinnerung');
  await page.fill('#mahnTextIn', 'Eigener Text der Erinnerung'); await page.click('[data-act="mahn-new"]'); await page.waitForTimeout(300);
  let mahn = await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:rechnungen')).find(y => y.type === 'schluss').mahn);
  assert(mahn.length === 1 && mahn[0].lvl === 0 && mahn[0].fee === 0 && mahn[0].text === 'Eigener Text der Erinnerung', 'Zahlungserinnerung gespeichert mit eigenem Text');
  assert(/Die nächste Stufe ist ab dem/.test(await page.textContent('#mahnBox')), 'nächste Stufe erst nach Ablauf der neuen Frist');
  await page.click('#sheet [data-act="cancel"]');
  await setRe(`x.mahn[0].due = '${days(-1)}'`); await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.click('[data-act="tab"][data-tab="rechnungen"]'); await page.click('#rechnungenList article:has-text("-003") .vendor'); await page.waitForSelector('#mahnBox');
  mb = (await page.textContent('#mahnBox')).replace(/\s+/g, ' ');
  assert(/1\. Mahnung fällig/.test(mb) && /Mahngebühr\s*2,50/.test(mb) && /597,50/.test(mb), '1. Mahnung: 2,50 € Gebühr, 597,50 €');
  await page.check('#mahnPausch'); await page.waitForTimeout(100);
  assert(/Verzugspauschale.*40,00.*637,50/.test((await page.textContent('#mahnBox')).replace(/\s+/g, ' ')), 'mit 40 € Pauschale: 637,50 €');
  await page.click('[data-act="mahn-new"]'); await page.waitForTimeout(300); await page.click('#sheet [data-act="cancel"]');
  await setRe(`x.mahn[1].date = '${days(-30)}'; x.mahn[1].due = '${days(-20)}'`); await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.click('[data-act="tab"][data-tab="rechnungen"]'); await page.click('#rechnungenList article:has-text("-003") .vendor'); await page.waitForSelector('#mahnBox');
  mb = (await page.textContent('#mahnBox')).replace(/\s+/g, ' ');
  assert(/2\. Mahnung fällig/.test(mb) && /Kosten aus früheren Mahnungen\s*42,50/.test(mb) && /Verzugszinsen 10,52 % p\. a\. für 30 Tage\s*5,14/.test(mb) && /645,14/.test(mb) && !/Verzugspauschale verlangen/.test(mb), '2. Mahnung: frühere Kosten 42,50 €, 10,52 % für 30 Tage = 5,14 €, gesamt 645,14 €, Pauschale nicht doppelt: ' + mb.slice(-260));
  assert(/gerichtliche Mahnverfahren/.test(await page.inputValue('#mahnTextIn')), 'Text der 2. Mahnung kündigt das Mahnverfahren an');
  await page.click('[data-act="mahn-new"]'); await page.waitForTimeout(300);
  assert(/Alle Mahnstufen sind verschickt/.test(await page.textContent('#mahnBox')) && (await page.$$('#mahnBox [data-act="mahn-pdf"]')).length === 3, 'nach drei Stufen: Hinweis und drei PDF-Knöpfe');
  await page.click('#sheet [data-act="cancel"]');
  assert(/2\. Mahnung/.test(await page.textContent('#rechnungenList article:has-text("-003")')), 'Liste zeigt die letzte Mahnstufe');
  // Nachkalkulation nimmt die Schlussrechnung (Gesamtleistung netto 2.000 €)
  await page.click('[data-act="tab"][data-tab="auftraege"]'); await page.click('#auftraegeList article:has-text("Bad EG") .vendor'); await page.waitForSelector('#nkBox');
  assert(/Schlussrechnung R-\d{4}-003\)\s*2\.000,00/.test(await page.textContent('#nkBox')), 'Nachkalkulation: Erlös aus der Schlussrechnung 2.000,00 €');
  console.log('Fehler: ' + (errs.join('|') || 'keine')); await b.close();
})();
