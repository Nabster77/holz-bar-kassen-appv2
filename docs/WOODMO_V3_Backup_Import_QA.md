# WOODMO 3.0 – Backup- und Importprüfung (isolierter V3-Prüfbranch)

Stand: 2026-11-13. Keine Veröffentlichung, keine V2-Änderung.

## Schutzgrenzen
- Keine Tests gegen die produktive V2-Webseite oder deren Datenbank.
- Katalog, Bilder, Preise, SCHUSS-Sorten, Pfand, Mitarbeiter und Zugangsdaten der V3-Testdatenbank während dieser QA nicht verändern.
- Für automatisierte Regressionstests ausschließlich generierte In-Memory-Daten nutzen.
- Ein echter Wiederherstellungstest gegen Supabase darf erst stattfinden, nachdem die tatsächliche V2/V3-Datenbankzuordnung verifiziert ist.
- Eine Wiederherstellung darf niemals endgültige Tagesabschlüsse oder neuere Cloud-Daten überschreiben.

## Automatisiert vorhandene Prüffälle (Code)
| Bereich | Bestehendes Prüfskript | Prüfung |
| --- | --- | --- |
| Excel-Roundtrip | scripts/check-catalog-transfer.ts | Export -> Import mit Vergleich; Warengruppen, Artikel, VK DE/AT, Steuer DE/AT, Pfand und SCHUSS |
| Vorschau/Fehlerfälle | scripts/check-catalog-transfer.ts | Neue/geänderte/unveränderte Werte, Dubletten, ungültige Preise, Formeln, ZIP-Bilder/Unterordner |
| Atomarer Cloud-Katalogimport (isoliertes PostgreSQL) | scripts/check-catalog-import-sql.mjs | Rollback, Zugriffsschutz, Konflikt bei veralteter Vorschau, Versionshistorie, unveränderte Kassendaten |
| Backup-Archiv | scripts/check-backup-archive.mjs | Prüfsummen, inkrementelle Änderungen, Backup 1/2, Korrupter-Datei-Test, Jahreswechsel |
| Backup-Richtlinien | scripts/check-backup-sync-policy.mjs | Online-/Offline-Sperre, Warteschlange, Bearbeitung durch Mitarbeiter, Freigabe Backup 2 |
| Wiederherstellungsgrenzen | scripts/check-recovery-guards.mjs | Keine doppelten Verkäufe; kein Überschreiben geschlossener Sitzungen, Resetschutz |
| Cloud-Backup Metadaten | scripts/check-backup-checkpoint.mjs | Unabhängige Cloud-/Backup1-/Backup2-Zeitstempel und Revisionen |
| Storno-Backup | scripts/check-storno-backup.mjs | Cloud-Storno-Belege nicht blind aus unbestätigtem Backup rekonstruieren |

Alle genannten Skripte sind in `npm test` enthalten. Der vollständige Testlauf muss auf dem aktuellen Branch erfolgreich abgeschlossen werden, bevor er als bestanden gelten darf.

## Noch NICHT als bestanden klassifizieren
1. Ein echter Browser-Ende-zu-Ende-Test von "Backup exportieren" -> heruntergeladene Datei prüfen -> "Backup importieren" -> Vergleich aller relevanten Daten.
2. Echtgeräte-Test des persistenten PDF-Ordners in Firefox/Edge/Chrome/Android Samsung Internet; Download ≠ garantiert geschriebene Datei.
3. Die Backup-1-/Backup-2-Archivierungsfunktionen existieren in `src/lib/backupArchive.ts`, sind nach Codeinspektion aber noch nicht in `App.tsx` verdrahtet; ihre isolierten Tests beweisen keine automatische Laufzeitsicherung.
4. Vollständiger Wiederherstellungstest mit Stornos, abgeschlossenen Sitzungen, Reset-Generation, unsynchronisierten Buchungen und zwei Geräten.
5. Sicherheit und Benutzererlebnis bei beschädigten, alten oder extrem großen JSON-Backups.
6. Die alten Reset-Nummerierungstests prüfen noch auf vollständige Löschung aller Sitzungen. Das widerspricht der neuen Geschäftsregel "Abschlüsse behalten" und ist separat umzubauen.
7. Ein wiederhergestellter Katalog darf während dieser Prüfphase nicht in die bestehenden V3-Stammdaten geschrieben werden.

## Priorisierung
Zunächst PC-Kasse, sichere Synchronisierung, offene Sitzung über Tagesgrenze und Reset/Abschluss. Danach automatisierte Backup-Roundtrip-Regressionen; zuletzt Browser- und Tablet-Ende-zu-Ende-Test.

## Ergebnisregel
Nur automatisiert gelaufene Tests mit erfolgreichem Exit-Code sind "bestanden". Eine grüne Buildprüfung ersetzt keinen echten Browser-/Cloud-Importtest. Keine reale Datenänderung ohne klare Zielzuordnung.
