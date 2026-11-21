// Angebotsliste: „PDF ansehen“ öffnet das PDF in der App, „Senden“ teilt es (Android) oder speichert es und öffnet
// die E-Mail; danach ist das Angebot versendet. (PDF-Bibliothek nachgebaut, pdf.js offline → eingebettete Ansicht.)
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true }); const page = await ctx.newPage();
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
    window.open = () => ({}); // E-Mail-Programm nicht wirklich öffnen
  });
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.goto(APP); await page.waitForSelector('.mtile');
  await page.evaluate(() => {
    localStorage.setItem('belegbuch:auftraege', JSON.stringify([{ id: 'b1', kind: 'kunde', title: 'Bad EG', party: 'Petra Meier', ckind: 'privat', status: 'Anfrage', amount: 0, _t: 1 }]));
    localStorage.setItem('belegbuch:angebote', JSON.stringify([
      { id: 'g1', auftragId: 'b1', nr: 'A-2026-004', name: 'Petra Meier', email: 'meier@test.de', title: 'Fliesenarbeiten Bad EG', date: '2026-11-20', valid: '2026-12-20', status: 'Entwurf', ckind: 'privat', vat: 0, discount: 0, positions: [{ text: 'Fliesen verlegen', qty: 10, unit: 'm²', price: 55, art: 'lohn' }], intro: '', outro: '', _t: 1 },
      { id: 'g2', auftragId: 'b1', nr: 'A-2026-005', name: 'Petra Meier', email: 'meier@test.de', title: 'Nachtrag', date: '2026-11-21', status: 'Entwurf', ckind: 'privat', vat: 0, discount: 0, positions: [{ text: 'Silikon', qty: 5, unit: 'lfm', price: 8, art: 'lohn' }], intro: '', outro: '', _t: 1 }]));
  });
  await page.reload(); await page.waitForSelector('.mtile'); await page.click('.mtile[data-tab="rechnungen"]'); await page.click('#v-rechnungen .seg [data-tab="angebote"]');
  assert(/PDF ansehen & senden/.test(await page.textContent('#angeboteList article:has-text("A-2026-004") [data-act="ang-view"]')), 'Knopf „PDF ansehen & senden“ an jedem Entwurf');
  await page.click('#angeboteList article:has-text("A-2026-004") [data-act="ang-view"]'); await page.waitForSelector('#viewer:not([hidden])');
  await page.waitForFunction(() => !/wird angezeigt/.test(document.querySelector('#viewerBody').textContent));
  assert(/A-2026-004/.test(await page.textContent('#viewerT')) && await page.isVisible('#viewerSend') && /meier@test\.de/.test(await page.textContent('#viewerMsg')), 'PDF in der App, „Senden“ mit Empfänger');
  assert(await page.isHidden('#sheet'), 'Ansehen öffnet nicht das Bearbeiten-Formular');
  // Ohne Teilen-Funktion: speichern + E-Mail, dann bestätigen
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#viewerSend')]);
  assert(dl.suggestedFilename() === 'Angebot-A-2026-004.pdf' && await page.isVisible('#viewerMark') && /anhängen/.test(await page.textContent('#viewerMsg')), 'PDF gespeichert, E-Mail geöffnet, Knopf „Als versendet markieren“');
  await page.click('#viewerMark'); await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ g: JSON.parse(localStorage.getItem('belegbuch:angebote')).find(x => x.id === 'g1'), a: JSON.parse(localStorage.getItem('belegbuch:auftraege'))[0] }));
  assert(st.g.status === 'Versendet' && st.g.sentAt && st.a.status === 'Angebot', 'Angebot versendet, Baustelle auf „Angebot“');
  assert(/^PDF ansehen$/.test((await page.textContent('#angeboteList article:has-text("A-2026-004") [data-act="ang-view"]')).trim()), 'versendetes Angebot: Knopf nur noch „PDF ansehen“');
  // Mit Teilen-Funktion (Android): teilt Datei + Text, markiert gleich als versendet
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { n: d.files.length, name: d.files[0].name, title: d.title, text: d.text }; }; });
  await page.click('#angeboteList article:has-text("A-2026-005") [data-act="ang-view"]'); await page.waitForSelector('#viewer:not([hidden])');
  await page.waitForFunction(() => /Auswahl/.test(document.querySelector('#viewerMsg').textContent), null, { timeout: 5000 }).catch(() => {});
  assert(/Auswahl/.test(await page.textContent('#viewerMsg')), 'Hinweis: Teilen mit Anhang');
  await page.click('#viewerSend'); await page.waitForSelector('#viewer', { state: 'hidden' });
  const sh = await page.evaluate(() => window.__shared);
  assert(sh && sh.n === 1 && sh.name === 'Angebot-A-2026-005.pdf' && /Angebot A-2026-005/.test(sh.title) && /Guten Tag Petra Meier/.test(sh.text), 'geteilt: PDF, Betreff und Text');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('belegbuch:angebote')).find(x => x.id === 'g2').status === 'Versendet'), 'nach dem Teilen als versendet markiert');
  // Vorschau im Formular (Schritt 4)
  await page.click('#angeboteList article:has-text("A-2026-005") .vendor'); await page.waitForSelector('#angBody .stepper');
  await page.click('.stepper [data-step="4"]'); await page.click('[data-act="ang-view-draft"]'); await page.waitForSelector('#viewer:not([hidden])');
  assert(/Vorschau/.test(await page.textContent('#viewerT')) && await page.isHidden('#viewerSend'), 'Vorschau im Formular ohne „Senden“');
  await page.click('[data-act="viewer-close"]');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
