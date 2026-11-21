// Rechnung: „PDF ansehen“ im Entwurf, „Rechnung prüfen und stellen“ zeigt erst die Vorschau mit der künftigen Nummer,
// gestellt wird im Vorschaufenster; danach PDF mit „Senden“. Liste: „PDF ansehen & senden“. (PDF-Bibliothek nachgebaut.)
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
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
    window.open = () => ({});
  });
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:settings', JSON.stringify([{ id: 'firma', name: 'FFH', street: 'Kirchstraße 40', city: '18510 Zarrendorf', iban: 'DE00 1234', taxid: '079/123/45678', bank: 'DKB', kleinunt: true, _t: 1 }]));
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Gästebad', party: 'Simone Jung', ckind: 'privat', status: 'Beauftragt', amount: 0, _t: 1 }]));
    localStorage.setItem('belegbuch:rechnungen', JSON.stringify([{ id: 'r1', auftragId: 'b1', nr: '', name: 'Simone Jung', email: 'jung@test.de', address: 'Weidenring 12, 18442 Negast', site: 'Weidenring 12, 18442 Negast', title: 'Fliesenarbeiten Gästebad', date: '2026-11-21', servFrom: '2026-11-18', servTo: '2026-11-21', terms: 14, due: '2026-12-05', status: 'Entwurf', ckind: 'privat', vat: 0, discount: 0, intro: 'Guten Tag,', outro: 'Danke', _t: 1, positions: [{ art: 'lohn', katId: 'verl-std', text: 'Bodenfliesen verlegen', unit: 'm²', qty: 2.7, price: 48.5 }] }]));
  });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="rechnungen"]');
  assert(/^PDF ansehen$/.test((await page.textContent('#rechnungenList [data-act="re-view-list"]')).trim()), 'Liste: Entwurf hat „PDF ansehen“');
  await page.click('#rechnungenList .row .vendor'); await page.waitForSelector('#angBody [data-act="re-view"]');
  await page.click('[data-act="re-view"]'); await page.waitForSelector('#viewer:not([hidden])');
  assert(/Entwurf/.test(await page.textContent('#viewerT')) && await page.isHidden('#viewerSend') && await page.isHidden('#viewerIssue'), 'Entwurf: Vorschau ohne Senden');
  await page.click('[data-act="viewer-close"]');
  await page.evaluate(() => { window.__pdf = []; });
  await page.click('[data-act="re-issue"]'); await page.waitForSelector('#viewer:not([hidden])');
  const y = new Date().getFullYear();
  assert(new RegExp('Vorschau Rechnung R-' + y + '-001').test(await page.textContent('#viewerT')) && await page.isVisible('#viewerIssue') && await page.evaluate(() => window.__pdf.join(' ')).then(t => /R-\d{4}-001/.test(t)), 'Stellen: erst Vorschau mit künftiger Nummer im PDF');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:rechnungen'))[0].status === 'Entwurf'), 'noch nicht gestellt, solange nur die Vorschau offen ist');
  await page.click('[data-act="viewer-close"]');
  assert(/Entwurf/.test(await page.textContent('#sheetTitle')), 'Vorschau schließen: Rechnung bleibt Entwurf und änderbar');
  await page.click('[data-act="re-issue"]'); await page.waitForSelector('#viewerIssue:not([hidden])'); await page.click('#viewerIssue');
  await page.waitForFunction(() => /Gestellt/.test(document.querySelector('#sheetTitle').textContent)); await page.waitForSelector('#viewer:not([hidden])');
  assert(new RegExp('R-' + y + '-001').test(await page.textContent('#viewerT')) && await page.isVisible('#viewerSend') && /jung@test\.de/.test(await page.textContent('#viewerMsg')), 'nach dem Stellen: PDF mit „Senden“');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#viewerSend')]);
  assert(dl.suggestedFilename() === 'Rechnung-R-' + y + '-001.pdf' && await page.isHidden('#viewerMark'), 'Senden: PDF gespeichert, E-Mail geöffnet (kein Status-Knopf bei Rechnungen)');
  await page.click('[data-act="viewer-close"]'); await page.click('[data-act="cancel"]');
  assert(/PDF ansehen & senden/.test(await page.textContent('#rechnungenList [data-act="re-view-list"]')), 'Liste: gestellte Rechnung „PDF ansehen & senden“');
  await page.click('#rechnungenList [data-act="re-view-list"]'); await page.waitForSelector('#viewer:not([hidden])');
  assert(await page.isVisible('#viewerSend') && await page.isHidden('#sheet'), 'aus der Liste: Senden ohne das Formular zu öffnen');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
