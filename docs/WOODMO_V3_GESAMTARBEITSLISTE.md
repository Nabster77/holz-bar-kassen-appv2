# WOODMO Kassen-App 3.0 – Gesamtarbeitsliste und Prüfstand
Stand 13.11.2026 · Ziel: PC zunächst sicher testbar, anschließend Tablet und ein separater V3-Link.

## Strikte Abgrenzung
- V2-Veröffentlichung **https://nabster77.github.io/holz-bar-kassen-appv2/** und GitHub-Branch **main** niemals ändern oder überschreiben.
- V3-Entwicklung: Branch `woodmo-v3.0`; aktuelle isolierte Korrekturen: `woodmo-v3-offline-safety-review`.
- Supabase: Projekt `tulndunkpsynkbbebenf` (Holz-Bar-Kasse) wurde als V3-Testziel freigegeben. Vor weiteren Cloud-Änderungen muss die Zuordnung des V2-Veröffentlichungsbuilds zu Supabase zweifelsfrei geklärt werden; GitHub-Actions-Variable `VITE_SUPABASE_URL` war nicht lesbar. **V2 darf nicht beeinträchtigt werden.**
- Artikel, Kategorien, Preise, Bilder, SCHUSS, Pfand-Konfiguration und Mitarbeiter in der bestehenden Datenbank nicht für Tests verändern. Nur synthetische In-Memory-Daten für Katalog/Importprüfungen.
- Änderungen am V3-Prüfbranch veröffentlichen **nicht** die V2-Webseite. Keine automatische Hintergrundarbeit aus diesem Chat.

## Arbeitsstand nach Priorität
| Prio | Bereich | Abnahme-Kriterium | Status |
| --- | --- | --- | --- |
| P0 | Eine offene Kasse pro Standort | Auch bei parallelen Geräten und Tageswechsel keine Zweiteröffnung; pro Standort unabhängig | **Serverseitiger Unique-Index aktiv und mit abgewiesenem Duplikat geprüft. Clientcode nur im Prüfbranch; kompletter Praxislauf offen.** |
| P0 | Fortsetzen offener Kasse | Logout, Browserneustart und Mitternacht lassen unveränderte Sitzung weiterlaufen, mit Öffnungszeit und Mitarbeiterprotokoll | Clientcode und Regressionstest im Prüfbranch; Browserlauf offen |
| P0 | Reset | Nach **geprüftem Vollbackup** darf Administrator gesamten Buchungsbestand inklusive offener/abgeschlossener Kassen, Stornos und Abschlussnummern löschen; Stammdaten behalten, geprüfte Archivkopie niemals löschen, Offline-Geräte abgleichen | Neue Anforderung 13.11.: Administrator darf jederzeit (auch Jahreswechsel/aktive Kasse) nach vollständiger rücklesbarer SHA-256-Sicherung ALLE Buchungsdaten inkl. Stornos/Abschlussbelege zurücksetzen. Alte RPC im Aktivmodus vorläufig gesperrt; verifizierter Cloud-Gesamtreset noch zu implementieren. |
| P0 | Aktive Buchungen | POS-Verkäufe, Bar/Karte, Pfand, Stornos, Einlagen/Entnahmen korrekt und ohne Doppelzählung | Noch vollständig zu prüfen |
| P0 | Tagesabschluss | Einmalig und unwiderruflich, Summen DE/AT korrekt, numerierter Cloud-Nachweis und verifizierte lokale Speicherung/PDF; keine falsche Erfolgsanzeige | Cloud-Belegnummern und Snapshot-Code vorhanden; echter End-to-End-/Fehlerfalltest sowie Offline-Abschluss noch offen |
| P0 | Offline-Speicher | Lokale Buchung trotz Internetverlust, Speicherfehler erkennbar, sichere Warteschlange mit Idempotenz und Konfliktanzeige; Kasse nach Neustart | Teilweise vorhanden; robustes Speichern/Neustart weiter offen |
| P0 | Offline-Storno | Berechtigung/Passwort, fünf zur Stornierung zulässige Bons (Nutzer schrieb jetzt „erste“, Code aktuell „letzte“ – klären), Storno ohne Internet, richtige Salden, keine Duplikate | Noch nicht implementiert; aktuelle Cloud-Storno-Funktion verweigert offline |
| P1 | Bargeldlogik | Anfangsbestand >0, letzter IST-Betrag bei neuer Sitzung übernehmen, nie negativer Kassenbestand; Karten nicht Bargeld | Code teils vorhanden, Sonderfälle und DE/AT prüfen |
| P1 | Export/Journale DE und AT | Brutto/Netto/Steuer, Pfand, Bar/Karte, Geldbewegungen, Stornos, vollständige PDFs ohne abgeschnittene Tabellen | Vorhandene Regressionstests; PDF-Anzeige und Druck in echten Browsern offen |
| P1 | Geräte-Setup und Ordner | Auswahl Tablet/PC/Notebook; automatische Capability-Erkennung; Downloads-Fallback Firefox, Chrome/Edge und Android inkl. Samsung Internet | V3-Prüfbranch erweitert; reale Berechtigungs-/Schreibtests offen |
| P1 | Tablet-Layout | Hochkant Artikel/Warenkorb erreichbar, Querformat ca. 65/35, Touchflächen, keine verschwundenen Warenkörbe | Code/Layoutprüfungen vorhanden; echtes Tablet offen |
| P1 | Enter-Taste | Standardbestätigung in allen geeigneten Dialogen, ohne Validierung zu umgehen | Kasseneröffnung bereits teilweise unterstützt; systematischer Audit offen |
| P1 | Excel Import/Export | Alle Artikel, Preise DE/AT, Preisarten, Steuer, Pfand, SCHUSS getrennt; Vorschau und ausdrückliche Bestätigung; ZIP-Unterordner/Bilder schützen | Automatisierte Tests vorhanden; echter Browser-/Cloud-Import später ohne Stammdatenänderung |
| P1 | JSON Backup/Restore | Vollständige Sicherung, Prüfsumme, Version, Roundtrip, Cloud-neuer-gewinnt, Storno/Abschluss nicht überschreiben, beschädigte Backups abweisen | Automatisierte Tests erfolgreich auf vorherigem CI-Stand; Browser-E2E offen; Backup1/2 noch nicht in App-Ablauf verdrahtet |
| P2 | QR-Code-Zugang Tablet | Separater V3-HTTPS-Link, QR-Code öffnet bevorzugten Tabletbrowser, niemals V2-Adresse | Nach PC-Abnahme; Hosting/URL noch nicht eingerichet |
| P2 | Kundenverwaltung | Kundenanlage später | Bewusst zurückgestellt |
| P2 | Installierte PWA | Kein Pflichtschritt, normale Browserlösung zuerst; vollständiger geräteautonomer Offline-Neustart braucht zusätzliche Cache-Technik | Bewusst zurückgestellt |

## Zu prüfen und zu protokollieren
1. `npm run typecheck`, `npm test`, `npm run build`, `npm run lint` am Prüfbranch erfolgreich, bevor Code in `woodmo-v3.0` übernommen wird.
2. Bei jedem Cloud-Test vor/nachher Tabellenzählungen: Verkäufe, Sitzungen, Abschlüsse, Stornos, Reset-Generationen; Katalog/Personal unverändert.
3. Für Eröffnung und Tagesabschluss gleichzeitige-PC/Tablet-Zugriffe durch Cloud-RPC/Unique-Index schützen.
4. V2-Datenbankzuordnung verifizieren; nicht allein aus Projektname oder Branch schließen, dass Cloud isoliert ist.
5. Server-SQL-Reset und ältere Tests auf **verifizierten vollständigen Administrator-Reset** umbauen: Backup dauerhaft lesen/verifizieren, atomar Buchungsdaten entfernen, Generation und neues Nummernsystem; Stammdaten unverändert.
6. Nach Abschluss auf PC Tabletbrowser Samsung Internet/Chrome im Quer- und Hochformat testen, QR-Link und Ablageberechtigung manuell bestätigen.

## Nachträge ausdrücklich behalten
- Einmalige Administrator-Abfrage pro Sitzung für Verwaltung/Journal, kein vorbelegtes Passwort.
- Startbildschirm mit Kasse eröffnen/Verwaltung; Home-Taste zurück, keine breite linke Sidebar, WOODMO-3.0-Logo, dezente Statusanzeige grün pulsierend/rot statisch.
- Aktivmodus speichert und synchronisiert; Testmodus simuliert ohne dauerhafte Buchungen.
- Standort- und Mitarbeiterwechsel mit nachvollziehbaren Login-/Logout-Intervallen, Eröffnung pro Tag bzw. mehrere Öffnungen mit Datum/Uhrzeit dokumentiert.
- Gerätesicherung und Tagesabschluss-PDF müssen auch bei Browserordner-/Downloadfehlern eine nachvollziehbare Wiederholung ermöglichen, ohne den Tagesabschluss ein zweites Mal zu buchen.
- Bezahltaste kompakt, Warenkorb ausreichend Platz, Artikel- und Bildauswahl touchbedienbar.
- Prüfen ob Rücksetzung der Administrator-Zugangsdaten im Reset-Dialog noch irreführend/gefährlich dokumentiert ist.

## Ergänzung 13.11. – verbindlicher Reset & Excel
- Neue Reset-Regel ist in [WOODMO_V3_RESET_NEUE_REGEL.md](./WOODMO_V3_RESET_NEUE_REGEL.md) dokumentiert; sie ersetzt jede frühere Aussage „Reset darf niemals abgeschlossene Buchungen entfernen“. Nach **verifiziertem Archiv** ist ein vollständiger Buchungsreset durch Administrator erlaubt.
- Vollarchiv-Prüfmodul und Regressionstests: `src/lib/bookingResetArchive.ts` und `scripts/check-v3-booking-reset-archive.mjs`. Noch **nicht** mit Cloud-Löschung verknüpft.
- Excel-Import/Export bleibt: Vorschau, doppelte Artikel verhindern, Waren-/Preis-/Steuer-/Pfanddaten DE und AT, SCHUSS geschützt, ZIP-Bildzuordnung ohne Überschreibungen, explizite Bestätigung, danach Cloud-Synchronisation.
