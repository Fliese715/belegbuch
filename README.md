# Belegbuch

Büro-App für einen Fliesenleger-Betrieb: Belege und Fahrten, Baustellen und Materialbestellungen,
Aufmaß, Angebote, Rechnungen als PDF. Läuft als installierbare Web-App, auch ohne Internet.
Alle Daten bleiben auf dem eigenen Gerät.

App öffnen: https://fliese715.github.io/belegbuch/

## Für Entwickler

### Aufbau des Repositorys

| Pfad | Inhalt |
|---|---|
| `src/belegbuch.html` | **Der gesamte Quelltext** (CSS, HTML-Gerüst, JavaScript) – nur hier wird geändert |
| `tools/build.py` | baut daraus `index.html` und `sw.js` |
| `index.html`, `sw.js` | Bauergebnis, von GitHub Pages ausgeliefert – nicht von Hand ändern |
| `manifest.webmanifest`, `icon-*.png` | Angaben und Symbole für die Installation als App |
| `tests/` | Rauchtests mit Playwright |

### Architektur in Kürze

- **Eine Datei, kein Framework, kein Bundler.** Das JavaScript ist eine einzige IIFE in ES5-Stil.
  Der Kopfkommentar in `src/belegbuch.html` beschreibt Abschnitte, Datenmodell und Betriebsarten.
- **Zustand:** ein Objekt `state`. `render()` baut alle Reiter daraus neu (`innerHTML`);
  Eingaben laufen immer durch `esc()`.
- **Ereignisse:** eine delegierte Klick-Behandlung; Knöpfe tragen `data-act="…"`.
- **Zwei Betriebsarten:**
  - `local` – Web-App/PWA: Daten in `localStorage` unter `belegbuch:<sammlung>`.
  - `db` – dieselbe Datei als Claude-Artifact: Datenbank, Datei-Ablage, Speichern-Dialog und
    Mapbox-Routing kommen über `window.claude.use(…)`. Außerhalb davon sind diese Dienste `null`.
- **Abgleich zwischen Geräten:** Export/Import einer JSON-Datei (`belegbuch-abgleich.json`).
  Jedes Dokument trägt einen Zeitstempel `_t`; beim Zusammenführen gewinnt je Dokument die
  neuere Fassung, Löschungen werden über Löschmarken (`settings/geloescht`) weitergegeben
  (`syncMerge()`).
- **Sicherung:** dieselbe Datei als datierte Kopie (`belegbuch-sicherung-JJJJ-MM-TT.json`).
  Wiederherstellen ersetzt den ganzen Bestand (`restoreApply()`), der Stand davor bleibt einmal
  rückholbar. In „Zu erledigen“ erscheint ein Hinweis, wenn die Sicherung fehlt oder älter als
  drei Tage ist und es seitdem Änderungen gab.
- **Arbeitszeit und Nachkalkulation:** Stunden je Baustelle (Formular oder Zeitmessung „▶ Zeit“,
  gerundet auf ¼ Std). `nachkalk()` rechnet Erlös (gestellte Rechnung, sonst Auftragswert) minus
  Material (zugeordnete Belege) minus Fahrtkosten (km × Satz aus „Firma und Preise“) = Rohertrag,
  geteilt durch die Stunden = verdient je Stunde, verglichen mit dem Stundensatz der Preisliste.
  Kleinunternehmer (`isKlein()`) rechnen durchgehend brutto, ohne Vorsteuer.
- **Rechnungsarten:** `rechnungen.type` = `rechnung` | `abschlag` | `schluss` | `storno`, eine gemeinsame
  Nummernfolge R-JJJJ-NNN. Die Schlussrechnung zieht gestellte Abschläge ab (`deduct`, `payable()`).
  Stornieren erzeugt eine eigene Stornorechnung mit negativen Mengen; das Original wird „Storniert“.
- **Mahnwesen:** Zahlungserinnerung, 1. und 2. Mahnung (`rechnungen.mahn`, `nextMahn()`, `mahnCalc()`,
  `pdfMahn()`): Gebühr ab der 1. Mahnung, Verzugszinsen ab der 1. Mahnung (Basiszins + 5 bzw. + 9
  Punkte), 40-€-Pauschale nur bei Firmen und nur einmal; Einstellungen in `settings/mahnung`.
- **Materialrechner:** im Aufmaß (`matList()`), Verbrauchswerte in `settings/material`.
- **Kundenkartei:** Sammlung `kunden`, Bezug über den Namen (`auftraege.party`); neue Kunden entstehen
  beim Speichern eines Kundenauftrags.
- **Fotodokumentation, Abnahme, Gewährleistung:** `auftraege.photos`, `auftraege.abnahme` mit
  Unterschriften (Canvas → PNG), `gwEnd()` = Abnahme + 5/4/2 Jahre; Hinweise in „Zu erledigen“.
- **E-Rechnungen lesen:** `parseEInvoice()` für XRechnung (UBL) und CII/ZUGFeRD, bei PDFs zuerst der
  eingebettete XML-Anhang über pdf.js (`pdfXml()`), sonst Texterkennung.
- **Jahresübersicht:** `jahrData()` in der Übersicht und als PDF, mit Kleinunternehmer-Grenzen.
- **Dateien (Fotos, PDFs):** in der Web-App als Blob in IndexedDB (`addFile()`, `fileSrc()`), in der
  Claude-Fassung in deren Datei-Ablage. Sicherungs- und Abgleich-Dateien enthalten alle Dateien,
  auf die ein Dokument verweist (Base64, `filesForExport()` / `importFiles()`).
- **Texterkennung:** beim Hinzufügen eines Fotos oder PDFs zu einem Beleg (nur Web-App):
  Tesseract.js (Deutsch) für Fotos, pdf.js für PDF-Text; beide werden erst bei Bedarf von jsDelivr
  geladen. `parseReceipt()` sucht Datum, Bruttobetrag, MwSt-Satz, Lieferant und Adresse und füllt
  nur leere Felder. Der Test dazu arbeitet mit einer nachgebauten Erkennung (fester Text).
- **Automatische Sicherung:** alle 30 Minuten, solange die App geöffnet ist und sich etwas geändert
  hat (`autoBackup()`): bis zu 48 Stände in IndexedDB (nur Daten, ohne Dateien), zusätzlich vollständig als Datei in einem gewählten
  Ordner, wenn der Browser die File System Access API anbietet.
- **Verschlüsselung:** Mit gesetztem Passwort werden Sicherungen und Abgleich-Datei mit AES-GCM
  verschlüsselt, Schlüssel per PBKDF2-SHA256 (250 000 Runden). Gespeichert wird nur der abgeleitete,
  nicht auslesbare Schlüssel (`packText()`, `unpack()`). Die Daten in der App selbst
  (`localStorage`) bleiben unverschlüsselt.
- **Offline:** `sw.js` hält die App-Dateien und die PDF-Bibliothek (jsPDF von cdnjs) im Cache.
  Eigene Dateien werden zuerst aus dem Netz geladen, damit Updates ankommen.

### Bauen und testen

```sh
python3 tools/build.py   # schreibt index.html und sw.js
sh tests/run.sh          # braucht Node.js und Playwright (Chromium)
```

Die Tests sind Rauchtests: Sie spielen typische Abläufe im Browser durch (Rechnung stellen und
stornieren, Aufträge, Fahrstrecken mit simuliertem Mapbox, PDF-Ordner, Sicherung und Wiederherstellung, automatische Sicherung mit Passwort, Abgleich zwischen zwei
Geräten, Neuladen ohne Netz) und schlagen bei Abstürzen und Seitenfehlern fehl. Sie prüfen keine
einzelnen Rechenergebnisse; PDF-Inhalte und die echte Texterkennung sind nicht automatisch geprüft.
PDFs werden mit einer nachgebauten Bibliothek geprüft (welche Texte geschrieben würden), nicht
als echte Datei. Die Beispiel-E-Rechnungen in `tests/daten` sind selbst geschrieben und nicht gegen
die offiziellen Prüfwerkzeuge validiert; ZUGFeRD-PDFs mit eingebetteter XML sind nicht getestet.

### Bekannte Grenzen

- Kein automatischer Abgleich: die Abgleich-Datei muss von Hand geladen und gespeichert werden.
- Bei gleichzeitiger Änderung desselben Dokuments auf zwei Geräten gewinnt die spätere Uhrzeit
  (ganzes Dokument, kein Zusammenführen einzelner Felder).
- `render()` baut immer alles neu; für sehr große Datenmengen wäre das zu langsam.
- E-Rechnungen werden gelesen, aber nicht erzeugt (für Kleinunternehmer nicht vorgeschrieben).
