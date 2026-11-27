# FFH Bau und Büro (Belegbuch)

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
- **Zustand:** ein Objekt `state`. `render()` baut alle Ansichten daraus neu (`innerHTML`);
  Eingaben laufen immer durch `esc()`.
- **Navigation:** Startseite ist ein Menü mit 9 Kacheln (`renderMenu()`, rote Zähler für Offenes).
  Jede Kachel öffnet eine Ansicht (`setTab()`, Adresse `#name`); „‹ Menü“ oben links und die
  Zurück-Taste des Geräts führen zurück (`pushState`/`popstate`). Rechnungen und Angebote teilen
  sich eine Kachel mit Umschalter.
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
  drei Tage ist und es seitdem Änderungen gab. Sicherung und Abgleich liegen hinter der violetten Menükachel „Datensicherung“.
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
- **Aufmaß:** Zeilen als Karten. Maßfelder rechnen (`evalMass`: + − × : und Klammern, ohne eval),
  z. B. Wandlängen „2,45 + 1,80 + 2,45 + 1,80“; „+“-Knopf am Feld, weil Zahlentastaturen oft kein Plus haben.
  Jede Zeile zeigt den Rechenweg; Summe je Raum, Gesamt; Rechenweg auch in PDF und CSV. Gespeichert wird die Eingabe.
- **Aufmaß-Übersicht:** Baustellen & Material › Aufmaß (`renderAufmassList`): Karten mit Flächen gesamt und je Raum,
  Öffnen / PDF / → Angebot, darunter Baustellen ohne Aufmaß. „+ Aufmaß“ wählt eine Baustelle oder legt beim
  Speichern eine neue an (Status „Anfrage“, Kundendaten aus der Kartei).
- **PLZ ergänzen (Angebot):** Fehlt in Rechnungs- oder Baustellenadresse die PLZ, sucht `plzLookup` sie online:
  in Claude über Mapbox, sonst openplzapi.org (Ersatz: OpenStreetMap/Nominatim). Ein Treffer oder genau einer im
  eigenen Bundesland wird eingesetzt, sonst Auswahl; ohne Treffer/Netz ein Feld zum Selbsteintragen.
- **Angebot ansehen und senden:** In der Angebotsliste „PDF ansehen“ (`angView` → `viewPdf`): Seiten werden mit pdf.js
  als Bilder gezeichnet (auch auf Android), sonst eingebettet. „Senden“ teilt das PDF mit Betreff und Text
  (`navigator.share`, Android) und markiert das Angebot als versendet; ohne Teilen: PDF speichern, E-Mail öffnen,
  danach „Als versendet markieren“. Schritt 4 im Formular hat eine Vorschau ohne Senden.
- **Adresse der Baustelle:** `siteCandidates` sammelt alle bekannten Adressen (Rechnung, Angebot – bei Privatkunden
  auch die Rechnungsadresse –, Termine, Kundenkartei; Firmensitz nur als Vorschlag). Leeres Feld wird mit der besten
  gefüllt, die übrigen stehen als Knöpfe darunter. „Strecke ermitteln“ nimmt das Feld. Das Aufmaß hat ein eigenes
  Adressfeld und speichert es an der Baustelle.
- **Preisliste:** `CATALOG` nach Gruppen (Verlegen, Zuschläge, Untergrund & Abbruch, Abdichtung, Profile & Zuschnitt,
  Dusche & Bad, Sonstiges); u. a. Dichtband, Dichtecken innen/außen, Manschetten Wand/Boden, Entkopplung, Fliesenschiene,
  Gehrung, Bohrungen, Treppe, Fensterbank, Bodenablauf, Duschrinne. `est: true` = Schätzwert ohne belastbare Quelle,
  in den Einstellungen markiert. Quellen im Kommentar über `CATALOG`.
- **Aufmaß-Bereiche aus der Preisliste:** `AM_CAT` (Kennung `k-…`) – Abdichtung Boden/Wand, Dichtband, Dichtecken,
  Manschetten, Entkopplung, Profile, Bohrungen, Treppe, Fensterbank, Bodenablauf, Duschrinne u. a. – stehen gruppiert in
  der Bereichsauswahl (`amTypeOptions`). Ein eigener Bereich gleichen Namens verdrängt den eingebauten.
- **Rechnung ← Angebot:** Kasten „Aus dem Angebot“ in Rechnungs-Entwürfen (`reAngPanel`, `reFromAng`): Rechnung ohne
  dieses Angebot → Kunde, Adressen, Positionen und Preise übernehmen; geändertes Angebot → Preise und neue Positionen
  nachziehen (Zuordnung über amKey bzw. Leistung + Text). Mengen danach aus dem Aufmaß. Kleinunternehmer-Warnung bei USt.
- **Angebot → Rechnung:** Knopf „In Rechnung übernehmen“ in der Angebotsliste und in Schritt 4 (`angToRe`): offener
  Rechnungsentwurf der Baustelle wird aus genau diesem Angebot aktualisiert, sonst entsteht eine neue Rechnung
  (Schlussrechnung, wenn Abschläge gestellt sind). Gibt es schon eine Rechnung, öffnet der Knopf sie.
- **Rechnung prüfen, stellen, senden:** „PDF ansehen“ im Entwurf (Vorschau). „Rechnung prüfen und stellen“ zeigt erst
  die Vorschau mit der künftigen Nummer (`reIssuePreview`); gestellt wird im Vorschaufenster, danach PDF mit „Senden“.
  Ohne PDF-Bibliothek (offline) bleibt die bisherige Bestätigung am Knopf. Liste: „PDF ansehen (& senden)“ je Rechnung.
- **Verknüpfungen (Prüfung 21.11.2026):** Kunde umbenennen zieht Baustellen und Entwürfe mit (`kundePropagate`);
  Baustelle mit gestellten Rechnungen ist nicht löschbar, beim Löschen bleiben Termine (mit Namen) und PDFs erhalten;
  Bestellung „für Baustelle“ (`forId`) – deren Belege zählen in Nachkalkulation und Kundenakte (`siteBelege`);
  gestellte Rechnung setzt ihr Angebot auf „Angenommen“; PDFs im Ordner lassen sich einer Baustelle zuordnen
  (Kundenakte „Verträge / PDF“); Speichern einer Baustelle erhält Felder, die das Formular nicht kennt;
  Nachkalkulation nimmt die gestellte Rechnung, nicht einen späteren Entwurf.
- **Kundenakte:** Klick auf einen Kunden (`openKundeAkte`): Kennzahlen, Baustellen, Termine, Aufmaß, Angebote,
  Rechnungen, Kosten (Belege der Baustellen); Zuordnung über die Baustellen des Kunden. Aus der Akte geöffnete
  Einträge tragen `draft.backKunde`, `closeSheet` führt dann zurück in die Akte. + Baustelle / + Angebot / + Aufmaß / + Termin
  übernehmen die Kundendaten; „Bearbeiten“ öffnet das bisherige Kundenformular.
- **Eigene Aufmaß-Bereiche:** `settings/aufmass.types` ({id, name, unit m²|lfm|Stk, katId}), per `amSync()` in `AM`
  eingeblendet. Anlegen über „+ Eigener Bereich …“ in der Bereichsauswahl oder Schnellvorschläge (Abdichtung Boden/Wand …).
  Abdichtung zählt nicht zur Fliesenfläche, füllt aber die Abdichtungsfläche des Materialrechners. Im Angebot mit
  passender Preislisten-Leistung (`amGuessKat`), sonst ohne Preis. Löschen nur, wenn kein Aufmaß den Bereich nutzt.
- **Aufmaß → Angebot:** Kasten „Aus dem Aufmaß“ in Schritt 2 (`amPanelHtml`, `amApply`). „Je Raum“ (Boden/Wand
  getrennt) oder „Zusammengefasst“; Positionen tragen `amKey`. Erneutes Übernehmen aktualisiert nur Mengen
  (Text/Preis bleiben), ergänzt neue und entfernt weggefallene Räume. Die Rechnung holt Mengen über `amKey`.
- **Eigene Termin-Erinnerung:** remind 'eigen' mit remindBefore (Minuten vor Beginn, ganztägig ab 8 Uhr) oder 'abs' +
  remindAt ('JJJJ-MM-TTTHH:MM', lokal). Push über die geplante Aufgabe „Termin-Erinnerung zur eigenen Zeit“
  (stündlich 5:40–22:40, Fenster je eine Stunde, 22:40 bis 5:40), minutengenau über den ICS-Alarm.
- **Beleg aus PDF-Rechnung:** „+ Beleg“ nimmt PDF, Foto oder E-Rechnung (XML) auch in der Claude-App an (Ablage über
  `storeFile`/Assets). PDF: eingebettete E-Rechnung, sonst Text über pdf.js → `parseReceipt`. Fotos liest nur die
  installierte App (Tesseract-Sprachdaten lassen sich im Artifact nicht laden).
- **Angebot in vier Schritten:** 1 Kunde (Baustelle wählen oder neu benennen, Kunde aus der Kartei),
  2 Leistungen (Positionen als Karten, Preisliste, freie Position, Aufmaß), 3 Texte, 4 Prüfen und Senden.
  Ein Angebot aus der Angebotsliste legt beim Speichern die Baustelle (Status „Anfrage“) an.
  Fehler beim Speichern springen zum passenden Schritt. Die Positionskarten gelten auch für Rechnungen.
- **„Text aus dem Beleg lesen“:** liest die Datei neu und überschreibt abweichende Felder (beim ersten Einlesen nur leere).
  Betrag auch, wenn er im PDF-Text vor „Gesamtbetrag“ steht; die eigene Adresse wird auch als „Kirchstr.“ erkannt.
- **Beleg-PDF ansehen:** PDFs von Belegen und Ordnern zeichnet die App selbst (pdf.js, Seiten als Bilder), weil
  Android-Browser PDFs im Rahmen nicht zeigen; pdf.js liegt im Offline-Speicher der installierten App.
- **Aufmaß → Rechnung:** Knopf „In Rechnung übernehmen“ im Aufmaß: offener Rechnungsentwurf bekommt die Mengen,
  sonst neue Rechnung (Preise aus dem Angebot der Baustelle, sonst Preisliste).
- **Rechner:** Knopf oben rechts (auch über offenen Formularen): + − × ÷, Klammern, Komma; Ergebnis kopieren oder ins zuletzt
  angetippte Zahlenfeld übernehmen (Betrag, Menge, Preis, Aufmaß-Maße).
- **Aufmaß Minus/Mal:** Knöpfe „−“ und „×“ neben „+“ an jedem Maß (Handy-Zifferntastatur hat kein Minus); Abzüge als Fläche oder B x H, mit „+“ für weitere.
- **Pauschalpreis:** Knopf „+ Pauschalpreis“ im Angebot (und Eintrag in der Auswahl der Rechnung): 1 psch, Betrag frei eingeben.
- **Aufmaß-Kachel:** eigene Kachel im Startmenü (nach „Baustellen & Material“), öffnet die Aufmaß-Übersicht mit „+ Aufmaß“.
- **Belege-Erinnerung:** Kachel in „Termine & Erledigen“ öffnet beim Antippen „+ Beleg“; grün wird sie, wenn heute
  ein neuer Beleg gespeichert oder sie mit „✓ Abhaken“ von Hand abgehakt wurde (settings/erinnerung.done). Link `#beleg-neu` öffnet „+ Beleg“ direkt (Abend-Push).
- **Termine:** Sammlung `termine` (Datum, Uhrzeit, Ort, Baustelle, Erinnerung). Liste in „Termine & Erledigen“
  neben der Belege-Erinnerung; Export als ICS-Datei (mit Alarmen) oder Google-Kalender-Link. Push-Erinnerungen
  kommen von zwei geplanten Aufgaben bei Claude, die die Artifact-Datenbank lesen: 21 Uhr (Belege + Termine
  von morgen) und 6:40 Uhr (Termine von heute).
- **Bauverzögerungen und Ausfallzeiten:** `auftraege.delays`, `endPlan`, `vob`; neuer Termin = geplanter
  Termin + Arbeitstage (Mo–Fr ohne gesetzliche Feiertage des Bundeslands, `holidays()`) der
  Verzögerungen (`endNow()`), Behinderungsanzeige
  als PDF (`pdfBehinderung()`). Sammlung `abwesenheit` für Urlaub/Krankheit; beim Anlegen optional
  ein Vermerk bei laufenden Baustellen (`src` verweist darauf, Löschen entfernt ihn wieder).
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
