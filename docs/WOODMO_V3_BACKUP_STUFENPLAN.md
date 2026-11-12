# WOODMO 3.0 – Tablet, Cloud, Backup 1 und Backup 2

**Stand 2026-11-12, nur Entwicklungsbranch `woodmo-v3.0`; kein Testserver und keine öffentliche Veröffentlichung freigegeben.**

**Jahresordner-Ergänzung:** Statt eines dauerhaft festen Einrichtungsordners `Kasse 26` wird für Sicherungen das Jahr der Schreibaktion verwendet (`Kasse 26`, `Kasse 27` usw.). Bereits bestehende ältere Sicherungen bleiben unangetastet; historische Backups werden über das Jahr ihres Archivdatums gelesen. Der automatische Backup-Scheduler ist weiterhin nicht aktiviert.

## Verbindliche Bedeutung

| Ebene | Quelle | Ziel | Zeitpunkt | Mitarbeiter angemeldet? |
|---|---|---|---|---|
| A | Tablet / lokale Warteschlange | Supabase-Cloud und umgekehrt | laufend (bestehend: ca. alle 30 Sekunden), manueller Synchronisieren-Button und nach Wiederverbindung | **Ja, erlaubt** |
| B | Nachweislich mit Cloud abgeglichener Stand | Backup 1 im gewählten Sicherungsordner | regelmäßig/bei Bedarf, inkrementell | **Ja, erlaubt**, nur bei konsistentem Snapshot |
| C | Verifiziertes Backup 1 | Backup 2 | **nur wenn kein Mitarbeiter auf irgendeinem Gerät angemeldet** und zwei Stunden Ruhe, inkrementell | **Nein** |

Der Benutzer muss den letzten erfolgreichen Zeitpunkt **separat für A/B/C** sehen. Cloud-Erfolg bestätigt niemals automatisch einen erfolgreichen Backup-1- oder Backup-2-Dateischreibvorgang. Fehler dürfen den Kassenbildschirm nicht blockieren.

Backup-2-Ruhezeit: Der vorher vereinbarte Wert von zwei Stunden bleibt bestehen. Ein begonnener vollständiger Sicherungslauf wird nicht mitten in einer Datei abgebrochen. Neue Mitarbeiteranmeldungen verhindern weitere Backup-2-Starts.

**Mehrere Tablets:** Nur zu prüfen, dass gerade auf diesem Tablet niemand angemeldet ist, genügt nicht. Der Scheduler muss einen **vertrauenswürdigen globalen Anmeldestatus** auswerten; wenn dieser nicht verifiziert ist, gilt Backup 2 als gesperrt. Ein Geräte-Heartbeat muss Ausfälle über eine Lease erkennen und darf einen zeitweise offline arbeitenden Mitarbeiter nicht ohne weiteres als abgemeldet erklären.

## Ordner im vom Benutzer ausgewählten Speicherort

```text
Ausgewählter Ordner/
├── Kasse 26/
│   ├── Friedrichshafen/
│   │   └── November/
│   │       └── Tagesabschluss/
│   ├── Bregenz/
│   └── Alle-Standorte/
    └── Sicherung/
        ├── Backup1/
        │   ├── current.json
        │   ├── manifest-<sha256>.json
        │   └── <datenteil>-<sha256>.json
        └── Backup2/
            ├── current.json
            ├── manifest-<sha256>.json
            └── <datenteil>-<sha256>.json
└── Kasse 27/
    ├── Friedrichshafen/
    ├── Bregenz/
    ├── Alle-Standorte/
    └── Sicherung/
        ├── Backup1/
        └── Backup2/
```

Der Ordnername richtet sich nach dem **Jahr des jeweiligen Archivvorgangs**. Für PDF-Berichte ist stattdessen das historische Berichtsjahr maßgeblich. Fehlende Jahres- und Standortordner werden bei der nächsten Benutzung ergänzt, Monate und Berichtsarten bei Bedarf; bereits vorhandene Strukturen bleiben unverändert. Die App erstellt nur dort Ordner, wo der Browser zuvor den Zugriff erlaubt hat. Auf Android/Firefox ohne File-System-Access-Unterstützung nur Download-/Teilen-Alternative; **keine Behauptung, dort im Hintergrund beliebig schreiben zu können**.

**Wichtig:** Backup 1 und Backup 2 im selben physischen Speicher schützen nicht bei Totalausfall dieses Speichermediums. Für echte Redundanz muss Backup 2 später auf einen unabhängigen Speicherort auswählbar sein.

## Bereits implementiert (ohne automatische Aktivierung)

- `src/lib/backupSyncPolicy.ts`: pure Freigaberegeln, globaler Mitarbeiterstatus, Inaktivität, Cloud-/Warteschlangen- und Testmodus-Schutz, inkrementeller Abschnittsvergleich.
- `src/lib/archiveRoot.ts`, `src/lib/journalPdfFile.ts`: erste Ordnerwahl erzeugt `Kasse 26/Sicherung/Backup1`, `Backup2` sowie das Berichtsjahr, sofern erlaubt.
- `src/lib/backupArchive.ts`: getrennte, abschnittsweise JSON-Backups mit SHA-256, unveränderlichen Datenabschnitten und erst zuletzt aktualisiertem Manifestzeiger. Unveränderte Abschnitte werden nicht erneut geschrieben. Lesen für Import ist vorbereitet.
- `src/lib/backupCheckpoint.ts`: separate Zeitstempel/Revisionen nach **bestätigten** Abgleichen. In `useCloudSync` wird nur nach erfolgreicher Cloud-Synchronisation der Cloud-Zeitstempel gesetzt.
- `src/components/DeviceSetupDialog.tsx`: zeigt letzten bestätigten Cloud-/Backup1-/Backup2-Zeitpunkt.
- Regressionstests: `scripts/check-backup-sync-policy.mjs`, `scripts/check-backup-archive.mjs`, `scripts/check-backup-checkpoint.mjs` über `npm test`.

**Nicht als fertig melden:** Der automatische Scheduler für B/C und die zuverlässige, geräteübergreifende Mitarbeiterpräsenz müssen noch mit dem laufenden Kassen-Code verbunden werden. Ein gemeinsamer Cloud-Login weist keine individuelle Mitarbeiterpräsenz nach. Vor einem automatischen Backup muss ein tatsächlich **vollständiger und mit Cloud synchronisierter Datenstand** inklusive Belegnummern, Stornos, Mitarbeiter und Recovery-Metadaten aufgebaut und validiert sein. Das ist derzeit noch offen. Bei fehlendem Dateisystemrecht ist eine sichtbare manuelle Sicherung erforderlich.

## Wiederherstellung und Buchungs-Reset

- Sicherungen sind getrennte, wiederherstellbare Geschäftsdaten; Archiv-PDFs dürfen durch Reset **nicht** gelöscht werden.
- Keine alte Sicherung darf eine neuere Cloud-Version still überschreiben oder einen neueren Reset rückgängig machen.
- Ein Backup vor Reset muss **vollständig erstellt, gelesen, geprüft und als erfolgreich bestätigt** sein; ein Download-Klick allein ist kein Integritätsnachweis.
- Keine Buchungszurücksetzung während einer offenen Kasse, bei nicht geklärtem Restbargeld, offenem Cloud-Outbox oder nicht abgeschlossenem Sicherungsabgleich.
- Der bisherige endgültige Tagesabschluss darf nicht verändert werden. Die ursprüngliche Regel zum Bargeldübertrag auf den nächsten Tag gilt bis zu einer ausdrücklich geklärten fachlichen Änderung weiter.
- Aufbewahrungspflichtige Buchungs- und Stornobelege dürfen bei einem Reset nicht spurlos verloren gehen. Bei Reset im Testbetrieb ist das getrennt vom produktiven Aufbewahrungskonzept zu behandeln.
- Die bestehende Restore-Pause und Generation-Rebase gegen Synchronisationsschleifen beibehalten und mit echten Daten testen.

## Abnahme vor erstem Demo-Test

1. Globale Mitarbeitersitzungen/Abmeldung für Backup 2 zuverlässig auf allen Geräten prüfen.
2. Vollständigen Cloud-Snapshot erstellen, gegen Outbox/Reset-Generation abgleichen.
3. Automatischen Backup-1-Takt und Backup-2-Idle-Scheduler anbinden, ohne Kasseneingaben zu blockieren.
4. Auf Android fehlende Hintergrund-Dateirechte als **nicht automatisch möglich** ausweisen.
5. Backup 1/2 exportieren, Manipulation erkennen, Wiederherstellung nachstellen, neuere Cloud-Datensätze schützen.
6. Reset-Sperren und vollständige Sicherung vor jeder destruktiven Aktion durchsetzen.
7. TypeScript, ESLint, Build und Regressionstests grün; praktischen Probecheck erst nach Nutzerfreigabe.
