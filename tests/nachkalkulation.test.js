const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// Arbeitszeit (Formular und Zeitmessung) und Nachkalkulation je Baustelle; Kleinunternehmer rechnet brutto.
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
const Y = String(new Date().getFullYear());
async function device(b, klein) {
  const page = await (await b.newContext({ viewport: { width: 400, height: 900 } })).newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(APP); await page.waitForSelector('#backupInfo');
  await page.evaluate(([klein, Y]) => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'Test', street: 'Musterweg 1', city: '18439 Stralsund', kleinunt: klein }, { id: 'preise', region: 0, own: { stunde: 50 }, ownPrivat: {}, kmRate: 0.3 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', title: 'Bad EG', party: 'Meier', site: 'Lindenweg 12', amount: 1000, status: 'In Arbeit', date: Y + '-02-01', due: Y + '-12-31', terms: 14, siteKm: 10, visits: 3 },
      { id: 'b2', kind: 'kunde', title: 'Küche', party: 'Schulz', amount: 500, status: 'Anfrage', date: Y + '-03-01', due: Y + '-12-31', terms: 14 }]));
    localStorage.setItem('belegbuch:belege', JSON.stringify([{ id: 'm1', date: Y + '-02-02', vendor: 'Würth', gross: 119, vat: 19, cat: 'Material', pay: 'Bar', orderId: 'b1', km: 20 }]));
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([{ id: 'r1', auftragId: 'b1', nr: 'R-' + Y + '-001', status: 'Gestellt', date: Y + '-03-01', due: Y + '-12-31', vat: klein ? 0 : 19, discount: 0, positions: [{ text: 'Fliesen', qty: 10, unit: 'm²', price: 120, art: 'lohn' }] }]));
  }, [klein, Y]);
  await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' }); return page;
}
(async () => {
  const b = await chromium.launch();
  // Kleinunternehmer: Erlös 1200 (keine USt), Material 119 brutto, Fahrten (60 + 20) km × 0,30 = 24 → Rohertrag 1057
  const K = await device(b, true);
  const tiles = await K.$$eval('#tiles .tile', t => t.map(x => x.innerText.replace(/\n/g, ' ')));
  assert(tiles.some(t => /Verdient je Stunde/i.test(t)) && !tiles.some(t => /Vorsteuer/i.test(t)), 'Kleinunternehmer: Kachel „Verdient je Stunde“ statt Vorsteuer');
  await K.click('[data-act="tab"][data-tab="belege"]'); assert(!/Vorsteuer/.test(await K.textContent('#belegeSum')), 'Belegsumme ohne Vorsteuer');
  await K.click('[data-act="tab"][data-tab="auftraege"]');
  const card = () => K.textContent('#auftraegeList article:has-text("Bad EG")');
  assert(/Rohertrag\s*1\.057,00\s*€/.test(await card()) && /noch keine Stunden/.test(await card()), 'Karte: Rohertrag 1.057,00 €, noch keine Stunden');
  assert(!/netto/.test(await card()), 'Karte ohne „netto“');
  // Zeit im Formular eintragen
  await K.click('#auftraegeList article:has-text("Bad EG") .vendor'); await K.waitForSelector('#hoursBox');
  assert(/Erlös \(Rechnung R-/.test(await K.textContent('#nkBox')), 'Nachkalkulation nimmt die gestellte Rechnung');
  await K.fill('#f-hh', '30'); await K.click('[data-act="hrs-add"]'); assert(/zwischen 0 und 24/.test(await K.textContent('#formErr')), 'mehr als 24 Std wird abgelehnt');
  await K.fill('#f-hh', '8'); await K.click('[data-act="hrs-add"]'); await K.fill('#f-hh', '7,5'); await K.fill('#f-hn', 'Verfugen'); await K.click('[data-act="hrs-add"]');
  const nk = await K.textContent('#nkBox');
  assert(/15:30 Std/.test(await K.textContent('#hoursBox')) && /68,19\s*€/.test(nk) && /über deinem Stundensatz von 50,00/.test(nk), 'Formular: 15:30 Std, 68,19 € je Std, über 50 €');
  await K.click('[data-act="hrs-del"]'); assert(/8:00 Std|7:30 Std/.test(await K.textContent('#hoursBox')) && !/15:30/.test(await K.textContent('#hoursBox')), 'Eintrag löschen');
  await K.fill('#f-hh', '8'); await K.click('[data-act="hrs-add"]');
  await K.click('[data-act="save"]'); await K.waitForTimeout(300);
  assert(/15:30 Std/.test(await card()) && /68,19\s*€ je Std/.test(await card()), 'Karte nach Speichern: 15:30 Std, 68,19 € je Std');
  // Zeitmessung: Start, zweite Baustelle startet → erste stoppt, Hinweis in Zu erledigen
  await K.click('#auftraegeList article:has-text("Bad EG") [data-act="timer"]'); await K.waitForTimeout(200);
  assert(/Stopp \(seit/.test(await card()), 'Zeitmessung läuft auf der Karte');
  await K.evaluate(() => { const a = JSON.parse(localStorage.getItem('belegbuch:auftraege')); a.find(x => x.id === 'b1').timer = Date.now() - 100 * 60000; localStorage.setItem('belegbuch:auftraege', JSON.stringify(a)); });
  await K.reload(); await K.waitForSelector('#backupInfo', { state: 'attached' }); await K.click('[data-act="tab"][data-tab="uebersicht"]');
  assert(/Zeit läuft: Bad EG/.test(await K.textContent('#todo')), 'Übersicht zeigt laufende Zeit');
  await K.click('[data-act="tab"][data-tab="auftraege"]');
  await K.click('#auftraegeList article:has-text("Küche") [data-act="timer"]'); await K.waitForTimeout(400);
  const st = await K.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege')).map(a => [a.id, !!a.timer, (a.hours || []).map(h => h.h).join('+')].join(':')).join(' '));
  assert(st === 'b1:false:7.5+8+1.75 b2:true:', 'Start auf Küche stoppt Bad EG (100 Min → 1,75 Std): ' + st);
  await K.click('#auftraegeList article:has-text("Küche") [data-act="timer"]'); await K.waitForTimeout(300);
  assert(await K.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:auftraege')).find(a => a.id === 'b2').hours[0].h) === 0.25, 'kurze Messung zählt mindestens ¼ Std');
  // Formular speichern behält laufende Zeit und Stunden
  await K.click('#auftraegeList article:has-text("Bad EG") [data-act="timer"]'); await K.waitForTimeout(200);
  await K.click('#auftraegeList article:has-text("Bad EG") .vendor'); await K.click('[data-act="save"]'); await K.waitForTimeout(300);
  assert(await K.evaluate(() => { const a = JSON.parse(localStorage.getItem('belegbuch:auftraege')).find(x => x.id === 'b1'); return a.timer > 0 && a.hours.length === 3; }), 'Speichern im Formular verliert weder Zeitmessung noch Stunden');
  // km-Satz in den Einstellungen
  await K.click('[data-act="settings"]'); await K.fill('#s-kmrate', '0,50'); await K.click('[data-act="set-save"]'); await K.waitForTimeout(300);
  assert(/Rohertrag\s*1\.041,00/.test(await card()), 'km-Satz 0,50 € wirkt: Rohertrag 1.041,00 €');
  // Regelbesteuert: Erlös netto 1200, Material netto 100, Fahrt 24 → 1076; Vorsteuer-Kachel bleibt
  const R = await device(b, false);
  assert((await R.$$eval('#tiles .tile', t => t.map(x => x.innerText))).some(t => /Vorsteuer/i.test(t)), 'Regelbesteuert: Vorsteuer-Kachel bleibt');
  await R.click('[data-act="tab"][data-tab="auftraege"]'); assert(/Rohertrag\s*1\.076,00/.test(await R.textContent('#auftraegeList article:has-text("Bad EG")')), 'Regelbesteuert: netto gerechnet, Rohertrag 1.076,00 €');
  console.log('Fehler: ' + ([K, R].map(p => p.errs.join('|')).filter(Boolean).join(' || ') || 'keine')); await b.close();
})();
