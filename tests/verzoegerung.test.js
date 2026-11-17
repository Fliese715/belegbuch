const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// Bauverzögerungen je Baustelle, Fertigstellungstermin, Behinderungsanzeige (PDF-Attrappe),
// Urlaub/Krankheit mit Vermerk bei laufenden Baustellen und Zählung in der Jahresübersicht.
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.addInitScript(() => { window.__pdf = []; window.jspdf = { jsPDF: function () { const self = new Proxy({}, { get: (t, k) => k === 'text' ? (s => { window.__pdf.push([].concat(s).join(' ')); return self; }) : k === 'splitTextToSize' ? (s => String(s).split('\n')) : k === 'getNumberOfPages' ? (() => 1) : k === 'output' ? (() => new Blob(['%PDF'], { type: 'application/pdf' })) : (() => self) }); return self; } }; });
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'Test Fliesen', owner: 'Max Test', kleinunt: true }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([
      { id: 'b1', kind: 'kunde', title: 'Bad EG', party: 'Meier', address: 'Lindenweg 12, 18439 Stralsund', site: 'Lindenweg 12', amount: 1000, status: 'In Arbeit', date: '2026-11-02', due: '2099-12-31', terms: 14 },
      { id: 'b2', kind: 'kunde', title: 'Küche', party: 'Schulz', amount: 500, status: 'Beauftragt', date: '2026-11-02', due: '2099-12-31', terms: 14 },
      { id: 'b3', kind: 'kunde', title: 'Anfrage Flur', party: 'Neu', amount: 0, status: 'Anfrage', date: '2026-11-02', due: '2099-12-31', terms: 14 },
      { id: 'b4', kind: 'kunde', title: 'Altbau', party: 'Alt', amount: 0, status: 'In Arbeit', date: '2026-01-02', due: '2099-12-31', terms: 14, endPlan: '2026-01-30' }]));
  });
  await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  assert(/Fertigstellung überschritten: Altbau/.test(await page.textContent('#todo')), 'Zu erledigen: Fertigstellung Altbau überschritten');
  // Verzögerungen im Formular: Fertigstellung Fr 27.11.2026; Wetter Mo 16.–Mi 18.11. = 3 AT; Material Do 19.11.–Mo 23.11. = 3 AT
  await page.click('[data-act="tab"][data-tab="auftraege"]'); await page.click('#auftraegeList article:has-text("Bad EG") .vendor'); await page.waitForSelector('#delaysBox');
  await page.fill('#f-endplan', '2026-11-27'); await page.check('#f-vob');
  await page.fill('#dl-from', '2026-11-16'); await page.fill('#dl-to', '2026-11-18'); await page.selectOption('#dl-reason', 'Wetter'); await page.fill('#dl-note', 'Frost, Kleber bindet nicht'); await page.click('[data-act="dl-add"]');
  await page.fill('#dl-from', '2026-11-19'); await page.fill('#dl-to', '2026-11-23'); await page.selectOption('#dl-reason', 'Material fehlt / Lieferverzug'); await page.click('[data-act="dl-add"]');
  let d = (await page.textContent('#delaysBox')).replace(/\s+/g, ' ');
  assert(/Summe\s*6 AT/.test(d) && /geplant 27\.11\.2026 → neu 07\.12\.2026/.test(d), 'Summe 6 Arbeitstage, Fertigstellung 27.11. → 07.12.2026: ' + d.slice(-90));
  await page.fill('#dl-from', '2026-11-20'); await page.fill('#dl-to', '2026-11-19'); await page.click('[data-act="dl-add"]'); assert(/Ende liegt vor dem Beginn/.test(await page.textContent('#formErr')), 'Ende vor Beginn wird abgelehnt');
  await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  const card = () => page.textContent('#auftraegeList article:has-text("Bad EG")');
  assert(/Fertig bis 07\.12\.2026 \(\+6 AT\)/.test(await card()), 'Karte: Fertig bis 07.12.2026 (+6 AT)');
  // Behinderungsanzeige
  await page.click('#auftraegeList article:has-text("Bad EG") .vendor'); await page.waitForSelector('#delaysBox [data-act="dl-pdf"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#delaysBox [data-act="dl-pdf"] >> nth=0')]);
  const t = await page.evaluate(() => window.__pdf.join(' '));
  assert(/Behinderungsanzeige-Bad-EG-2026-11-16\.pdf/.test(dl.suggestedFilename()) && /Behinderungsanzeige/.test(t) && /Grund: Wetter \(Frost, Kleber bindet nicht\)/.test(t) && /§ 6 Abs\. 1 VOB\/B/.test(t) && /voraussichtlich auf den 07\.12\.2026/.test(t), 'PDF: Behinderungsanzeige mit Grund, VOB/B und neuem Termin');
  assert(/angezeigt am/.test(await page.textContent('#delaysBox')), 'Datum der Anzeige wird vermerkt');
  await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  // Urlaub: Mo 30.11.–Fr 04.12.2026 = 5 AT, Vermerk bei laufenden Baustellen (Bad EG, Küche, Altbau)
  await page.click('[data-act="tab"][data-tab="uebersicht"]');
  await page.selectOption('#abs-type', 'urlaub'); await page.fill('#abs-from', '2026-11-30'); await page.fill('#abs-to', '2026-12-04'); await page.click('[data-act="abs-add"]');
  await page.waitForFunction(() => /Eingetragen/.test(document.querySelector('#absMsg').textContent));
  assert(/bei 3 laufenden Baustellen als Verzögerung vermerkt/.test(await page.textContent('#absMsg')), 'Urlaub bei 3 laufenden Baustellen vermerkt (nicht bei der Anfrage)');
  await page.selectOption('#abs-type', 'krank'); await page.fill('#abs-from', '2026-11-11'); await page.fill('#abs-to', '2026-11-12'); await page.uncheck('#abs-link'); await page.click('[data-act="abs-add"]'); await page.waitForTimeout(300);
  assert(/2026: 5 Urlaubstage · 2 Krankheitstage/.test((await page.textContent('#absBox')).replace(/\s+/g, ' ')), 'Zählung: 5 Urlaubstage, 2 Krankheitstage');
  assert(/Urlaubstage \/ Krankheitstage\s*5 \/ 2 AT/.test(await page.textContent('#jahrBox')), 'Jahresübersicht: 5 / 2 AT');
  await page.click('[data-act="tab"][data-tab="auftraege"]');
  assert(/Fertig bis 14\.12\.2026 \(\+11 AT\)/.test(await card()), 'Bad EG nach Urlaub: Fertig bis 14.12.2026 (+11 AT)');
  assert(/Verzögerung 5 AT/.test(await page.textContent('#auftraegeList article:has-text("Küche")')) && !/Verzögerung/.test(await page.textContent('#auftraegeList article:has-text("Anfrage Flur")')), 'Küche: Verzögerung 5 AT, Anfrage unberührt');
  // Urlaub löschen entfernt die Vermerke
  await page.click('[data-act="tab"][data-tab="uebersicht"]'); await page.click('#absBox tr:has-text("Urlaub") [data-act="abs-del"]'); await page.waitForTimeout(400);
  await page.click('[data-act="tab"][data-tab="auftraege"]');
  assert(/Fertig bis 07\.12\.2026 \(\+6 AT\)/.test(await card()) && !/Verzögerung/.test(await page.textContent('#auftraegeList article:has-text("Küche")')), 'nach Löschen des Urlaubs sind die Vermerke wieder weg');
  // Feiertage: geplant Di 22.12.2026 + 3 AT → 23., 24., (25. Feiertag, 26. Sa) → Mo 28.12.
  await page.click('#auftraegeList article:has-text("Küche") .vendor'); await page.waitForSelector('#delaysBox');
  await page.fill('#f-endplan', '2026-12-22'); await page.fill('#dl-from', '2026-11-25'); await page.fill('#dl-to', '2026-11-27'); await page.click('[data-act="dl-add"]');
  assert(/neu 28\.12\.2026/.test(await page.textContent('#delaysBox')), 'Weihnachten wird übersprungen: 22.12. + 3 AT = 28.12.2026');
  await page.fill('#f-endplan', '2026-05-14'); await page.dispatchEvent('#f-endplan', 'input');
  assert(/geplant 14\.05\.2026 \(Christi Himmelfahrt!\)/.test(await page.textContent('#delaysBox')), 'Hinweis, wenn der geplante Termin auf einen Feiertag fällt');
  await page.click('[data-act="cancel"]');
  // Ganzes Jahr 2026: 261 Werktage Mo–Fr, in MV 7 Feiertage an Werktagen → 254; in Bayern 9 → 252
  await page.click('[data-act="tab"][data-tab="uebersicht"]'); await page.selectOption('#jahrSel', '2026');
  await page.selectOption('#abs-type', 'sonstiges'); await page.fill('#abs-from', '2026-01-01'); await page.fill('#abs-to', '2026-12-31'); await page.uncheck('#abs-link'); await page.click('[data-act="abs-add"]'); await page.waitForTimeout(300);
  assert(/254 sonstige Ausfalltage/.test(await page.textContent('#absBox')) && /Feiertage in Mecklenburg-Vorpommern/.test(await page.textContent('#absBox')), 'Mecklenburg-Vorpommern 2026: 254 Arbeitstage');
  await page.click('[data-act="settings"]'); await page.selectOption('#s-land', 'BY'); await page.click('[data-act="set-save"]'); await page.waitForTimeout(300);
  assert(/252 sonstige Ausfalltage/.test(await page.textContent('#absBox')), 'Bayern 2026: 252 Arbeitstage (zusätzlich Heilige Drei Könige und Fronleichnam)');
  await page.click('[data-act="settings"]'); await page.selectOption('#s-land', 'SN'); await page.click('[data-act="set-save"]'); await page.waitForTimeout(300);
  assert(/253 sonstige Ausfalltage/.test(await page.textContent('#absBox')), 'Sachsen 2026: 253 (Buß- und Bettag Mi 18.11.)');
  console.log('Fehler: ' + (errs.join('|') || 'keine')); await b.close();
})();
