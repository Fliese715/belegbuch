const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
// PDF-Erzeugung mit einer NACHGEBAUTEN PDF-Bibliothek (jsPDF lässt sich hier nicht laden):
// prüft nur, dass Rechnung, Schlussrechnung, Stornorechnung und Mahnung ohne Fehler durchlaufen
// und welche Texte geschrieben würden – nicht, wie das PDF aussieht.
const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
const Y = String(new Date().getFullYear());
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  await page.addInitScript(() => {
    window.__pdf = [];
    window.jspdf = { jsPDF: function () {
      let pages = 1; const self = new Proxy({}, { get: (t, k) => {
        if (k === 'text') return (s) => { window.__pdf.push([].concat(s).join(' ')); return self; };
        if (k === 'splitTextToSize') return (s) => String(s).split('\n');
        if (k === 'getNumberOfPages') return () => pages;
        if (k === 'addPage') return () => { pages++; return self; };
        if (k === 'output') return () => new Blob(['%PDF-attrappe'], { type: 'application/pdf' });
        return () => self; } });
      return self; } };
  });
  await page.goto(APP); await page.waitForSelector('#backupInfo', { state: 'attached' });
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  await page.evaluate(([Y, past]) => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'Test Fliesen', owner: 'Max Test', street: 'Musterweg 1', city: '18439 Stralsund', taxid: '1', iban: 'DE00', kleinunt: true }]));
    const pos = [{ text: 'Fliesen verlegen', qty: 10, unit: 'm²', price: 200, art: 'lohn' }];
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([
      { id: 's1', type: 'schluss', nr: 'R-' + Y + '-003', status: 'Gestellt', name: 'Bau GmbH', address: 'Hafenstraße 1', date: Y + '-03-01', due: past, servFrom: Y + '-02-01', servTo: Y + '-03-01', vat: 0, positions: pos, deduct: [{ id: 'a1', nr: 'R-' + Y + '-001', date: Y + '-02-15', net: 1000, vat: 0, gross: 1000 }], mahn: [{ lvl: 0, date: past, due: past, open: 1000, fee: 0, rate: 10.52, days: 0, interest: 0, pausch: 0, total: 1000, text: 'Erinnerungstext' }] },
      { id: 'x1', type: 'storno', nr: 'R-' + Y + '-004', status: 'Storno', name: 'Bau GmbH', address: 'Hafenstraße 1', date: Y + '-03-02', due: Y + '-03-02', servFrom: Y + '-02-01', servTo: Y + '-03-01', vat: 0, positions: [{ text: 'Fliesen verlegen', qty: -10, unit: 'm²', price: 200 }], stornoOf: 's0', stornoOfNr: 'R-' + Y + '-002', stornoOfDate: Y + '-02-20', stornoOfType: 'abschlag' }]));
  }, [Y, d(-20)]);
  await page.reload(); await page.waitForSelector('#backupInfo', { state: 'attached' });
  const pdf = async (sel, id) => {
    await page.evaluate(() => { window.__pdf = []; });
    await page.click('[data-act="tab"][data-tab="rechnungen"]'); await page.click(`#rechnungenList article[data-edit="rechnungen:${id}"] .vendor`); await page.waitForSelector('#angBody');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
    const t = await page.evaluate(() => window.__pdf.join(' | ')); await page.click('#sheet [data-act="cancel"]'); return [dl.suggestedFilename(), t];
  };
  let [n, t] = await pdf('[data-act="re-pdf"]', 's1');
  assert(n === `Schlussrechnung-R-${Y}-003.pdf` && /Schlussrechnung R-\d{4}-003/.test(t) && /abzgl\. Abschlagsrechnung R-\d{4}-001/.test(t) && /Noch zu zahlen \| 1000,00 €/.test(t) && /§ 19 UStG/.test(t), 'Schlussrechnung: ' + n);
  [n, t] = await pdf('[data-act="re-pdf"]', 'x1');
  assert(n === `Stornorechnung-R-${Y}-004.pdf` && /Stornorechnung R-\d{4}-004/.test(t) && /Storno zur Abschlagsrechnung R-\d{4}-002/.test(t) && /-2000,00 €/.test(t) && !/Zahlbar bis/.test(t), 'Stornorechnung: ' + n);
  [n, t] = await pdf('[data-act="mahn-pdf"]', 's1');
  assert(n === `Zahlungserinnerung-R-${Y}-003.pdf` && /Zahlungserinnerung zur Rechnung R-\d{4}-003/.test(t) && /Erinnerungstext/.test(t) && /IBAN DE00/.test(t), 'Mahnung: ' + n);
  await page.evaluate(() => { window.__pdf = []; }); await page.click('[data-act="tab"][data-tab="uebersicht"]');
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="jahr-pdf"]')]);
  t = await page.evaluate(() => window.__pdf.join(' | '));
  assert(dj.suggestedFilename() === `Jahresuebersicht-${Y}.pdf` && new RegExp('Jahresübersicht ' + Y).test(t) && /Rechnungen \d{4} \(1\) \| -1\.000,00 €/.test(t) && /Kleinunternehmer \(§ 19 UStG\)/.test(t), 'Jahresübersicht-PDF (Schlussrechnung 1.000 € minus Storno 2.000 € der Testdaten): ' + dj.suggestedFilename());
  console.log('Fehler: ' + (errs.join('|') || 'keine')); await b.close();
})();
