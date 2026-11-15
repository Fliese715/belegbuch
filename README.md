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
- **Automatische Sicherung:** alle 30 Minuten, solange die App geöffnet ist und sich etwas geändert
  hat (`autoBackup()`): bis zu 48 Stände in IndexedDB, zusätzlich als Datei in einem gewählten
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
einzelnen Rechenergebnisse; PDF-Inhalte sind nicht automatisch geprüft.

### Bekannte Grenzen

- Kein automatischer Abgleich: die Abgleich-Datei muss von Hand geladen und gespeichert werden.
- Bei gleichzeitiger Änderung desselben Dokuments auf zwei Geräten gewinnt die spätere Uhrzeit
  (ganzes Dokument, kein Zusammenführen einzelner Felder).
- `render()` baut immer alles neu; für sehr große Datenmengen wäre das zu langsam.
- Stornieren markiert eine Rechnung nur als storniert; eine Stornorechnung wird nicht erzeugt.
- E-Rechnung (XRechnung/ZUGFeRD) ist nicht umgesetzt.
