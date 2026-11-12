# WOODMO V3.0 – Beginn der Umsetzung / technische Eintrittsprüfung

Datum: 2026-11-12. **Arbeitsbereich ausschließlich Branch `woodmo-v3.0`.**
Status: Quellcodeanalyse und nicht-destruktiver Testbaustein. **Keine Veröffentlichung, kein Start des lokalen Praxistestservers, keine Buchungs- oder Stammdatenänderung.**

## Nachweislich vorhanden (nicht doppelt entwickeln)

- Gerätelokaler PDF-Ordnerzugriff in `src/lib/journalPdfFile.ts`: Verzeichnishandle in IndexedDB, manuelle Auswahl und Rückfall auf Browser-Download.
- Jahres-/Standort-/Berichtsordner in `src/lib/archivePaths.ts` mit Test `scripts/check-archive-paths.mjs`.
- Schutz bereits archivierter finaler Tagesabschlüsse vor stillem Überschreiben bei lokaler PDF-Erzeugung.
- Backup-Recovery-Prüfung in `src/lib/backupRecovery.ts` und `src/lib/recoveryGuards.ts`, einschließlich Unterscheidung älterer Daten und Cloud-Reset-Generation.
- Im Branch vorhandene Tests zu Bargeldübertrag, Berichtsberechnungen, Recovery, Reset, Archivpfaden und Katalogimport.

## Neu implementiert – STORNO-Regelbasis (noch nicht in App aktiviert)

- `src/lib/stornoRules.ts`: `lastFiveStornoCandidates`, `prepareStorno`, `effectiveSales`.
- `scripts/check-storno-rules.mjs`: automatisierte Regressionstests für letzte fünf Belege, Bar-/Karteneffekt, Pfandretoure, bereits storniert, Pflichtbegründung, negative Kasse, geschlossene Sitzung, Standort.
- `package.json`: `npm run test:storno` und Integration in `npm test`.
- Im isolierten Prüfverzeichnis ausgeführt: `tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler src/lib/stornoRules.ts` → bestanden; `node --experimental-strip-types scripts/check-storno-rules.mjs` → bestanden.
- Die **bestehenden Buchungen werden nicht verändert**. In `effectiveSales` wird ein storniertes Original nur aus der aktuellen Umsatzansicht ausgeschlossen; Originalbeleg und Storno müssen in einem getrennten, unveränderlichen Audit-Ledger gespeichert und angezeigt werden.

## Kritische noch offene Implementierungsschritte vor Freischaltung

1. Datenmodell für unveränderliche Stornonachweise (inkl. Belegreferenz, Mitarbeiter, Begründung, Standort, Steuerbeträge), atomare eindeutige Cloud-Erfassung, Offline- und Doppelstorno-Schutz.
2. Sicheres Rückrechnen von Bargeld, Pfand, Umsatzsteuer, Karte und Artikelzahlen **in allen Berechnungswegen** (Kasse, Journal, Tagesabschluss, PDF, Wiederherstellung). Bereits finale Tagesabschlüsse bleiben unverändert; spätere Korrekturen müssen getrennt im zulässigen Zeitraum erscheinen.
3. Buchungs-Reset und Stornobeleg-Aufbewahrung abgleichen; **kein stummes Löschen steuerlich relevanter Ursprungsbelege**.
4. Gesamttests unter isolierten Bedingungen, inkl. fehlerhaften Netzverbindungen, Mehrfachklicks, Retry, gemischten Steuerarten.
5. Geräte-Setup ist im aktuellen Branch bereits integriert (Dialog, lokale Einstellung, PDF-Ordnerwahl/Downloads). Neuere Dateien aus GitHub wurden nach der ursprünglichen Notiz erneut verifiziert. Noch offen: vollständiger E2E-Test, finale PDF-Cloud-Archivierung und automatische Backup-Aktualisierung; zuletzt UI/Logo/3D-Feinschliff.
6. Nach Integration: vollständige Build-/Lint-/Typecheck-Prüfung anhand des aktuellen Repositorys, nicht nur des Einzelmoduls.

## Rechtliche Prüfgrundlage (keine behauptete Finanzamtszulassung)

- DE AO § 146 Abs. 1 und 4 (Einzelaufzeichnung, Nachvollziehbarkeit und ursprünglichen Inhalt erhalten): https://www.gesetze-im-internet.de/ao_1977/__146.html
- AT Registrierkassensicherheitsverordnung § 7 Abs. 2: Storno- und Trainingsbuchungen als eigenständige Einträge im Datenerfassungsprotokoll: https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20009390
- Die vom Nutzer gewünschte Prüfung der Berichtsarithmetik ist **nicht** gleich einer umfassenden Zertifizierung des Kassensystems für den gesetzlichen Produktiveinsatz in Deutschland und Österreich.

## Offene technische Freigabestufen

- Nur Codeanalyse, Regelbasis, Regressionstests und Vorbereitungen sind freigegeben.
- Lokalen Praxistestserver **erst nach explizitem Satz** „Jetzt können wir loslegen mit dem Testserver“ starten.
- Eine produktive Datenbankumstellung oder GitHub-Pages-Veröffentlichung **erst nach gesonderter Freigabe**.
- „Diesen Stand sichern“ markiert später explizit den geprüften Referenzstand.

## Nachtrag zur Wiederaufnahme nach unterbrochenem Nachrichtenstream

- GitHub-Commits und Branch kontrolliert; der Chat-Streamabbruch hat keine gespeicherten GitHub-Dateien zurückgenommen.
- Eine unvollständige SQL-Migrationsdatei wurde **aus `supabase/migrations/` entfernt** und als **nicht ausführbarer Entwurf** unter `docs/sql/WOODMO_V3_STORNO_SCHEMA_ENTWURF_NICHT_AUSFUEHREN.sql` archiviert.
- V3-Datenbank nur lesend geprüft: 77 Katalogeinträge, 33 Mitarbeiter-Datensätze, 0 Verkäufe, 0 Sitzungen; auf den vorhandenen pos-Tabellen ist RLS aktiviert; `pos_stornos` existiert nicht.
- Auf aktuellem Branch schon vorhanden: `src/components/DeviceSetupDialog.tsx`, `src/lib/deviceSetup.ts`, `archivePaths.ts` und `onDeviceSetup` in Verwaltung, sowie aktualisierter Buchungs-Reset ohne Passwortänderung.
- Test `scripts/check-device-setup.mjs` hinzugefügt und in `npm test` integriert.
- Isolierte Node-Prüfungen (Storno + Geräte-Setup) erfolgreich; TypeScript-Einzelmodulprüfungen erfolgreich. Kein vollständig verifizierter GitHub-Actions-Run/Produktions-Build.
