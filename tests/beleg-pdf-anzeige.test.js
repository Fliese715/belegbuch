// PDF eines Belegs öffnen: die App zeichnet die Seiten selbst (pdf.js), weil Android-Browser PDFs im Rahmen nicht zeigen.
const APP = 'file://' + require('path').resolve(__dirname, '../index.html');
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => /^(file|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const assert = (ok, msg) => { console.log((ok ? 'ok   ' : 'FALSCH ') + msg); if (!ok) process.exitCode = 1; };
  await page.addInitScript(() => { window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getAttachments: async () => null,
    getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'Würth Rechnung Gesamtbetrag 73,29 EUR', transform: [1, 0, 0, 1, 0, 800] }] }),
      getViewport: o => ({ width: 595 * o.scale, height: 842 * o.scale }), render: () => ({ promise: Promise.resolve() }) }) }) }) }; });
  await page.goto(APP + '#belege'); await page.waitForSelector('#fab');
  const tmp = fs.mkdtempSync(os.tmpdir() + '/bpdf'); fs.writeFileSync(tmp + '/r.pdf', '%PDF-1.4 Test');
  await page.click('#fab'); await page.setInputFiles('#photoFile', tmp + '/r.pdf'); await page.waitForFunction(() => /Erkannt|nicht/.test(document.querySelector('#photoBox').textContent));
  await page.fill('#f-vendor', 'Würth'); await page.fill('#f-gross', '73,29'); await page.click('[data-act="save"]'); await page.waitForTimeout(300);
  await page.click('#v-belege [data-act="file-open"]'); await page.waitForSelector('#viewer:not([hidden])');
  await page.waitForFunction(() => document.querySelectorAll('#viewerBody canvas').length === 2);
  assert(!(await page.$('#viewerBody iframe')), 'Beleg-PDF wird als Seitenbilder gezeigt (2 Seiten), kein leerer Rahmen');
  console.log('Fehler:', errs.join('|') || 'keine'); await b.close();
})();
