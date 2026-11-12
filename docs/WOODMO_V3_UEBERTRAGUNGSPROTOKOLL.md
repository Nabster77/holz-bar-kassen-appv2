# WOODMO_V3.0 – Übertragungs- und Prüfprotokoll

Stand: 2026-11-12. **Status: Vorprüfung; KEINE Datenmigration durchgeführt.**

## Ziel und Freigaberegeln
- WOODMO_V3.0 aus der bestehenden WOODMO-V2-Codebasis weiterentwickeln.
- V2-Produktivbetrieb und dessen Daten unangetastet lassen.
- V3 braucht Artikel, Warengruppen, beide Standortpreise, Mehrwertsteuer, Pfand, SCHUSS, Einstellungen, Bilder, Mitarbeiter und Berechtigungen.
- Vergangene V2-Kassenbuchungen müssen NICHT übernommen werden; bestehende V2-Buchungen dürfen NICHT gelöscht oder zurückgesetzt werden.
- Datenübernahme erst nach eindeutiger Feststellung der V2-Quelle, unveränderbarer Sicherung und 1:1-Abgleich. Neue V3-Felder und V3-Funktionen separat bewerten.
- Jeder Schreibschritt braucht Quelle, Ziel, Zeitpunkt, Commit/Migrations-ID, Sicherung, Vorher-/Nachher-Prüfsummen, Testresultat und Rückfallplan.

## Quellen und Ziele
- GitHub: Nabster77/holz-bar-kassen-appv2, V2-Basis `woodmo-entwicklung`, isolierter V3-Branch `woodmo-v3.0`.
- Supabase-Organisation: HolzBar.
- Bestehendes Projekt `Holz-Bar-Kasse` (Ref `tulndunkpsynkbbebenf`): Projektstatus aktiv; SQL-Lesezugriff mehrfach wegen Connection-Timeout fehlgeschlagen. **Nicht bewiesen, dass dies die aktuell genutzte V2-Datenquelle ist.**
- Bestehendes Projekt `Test-Holz-Bar-Kasse` (Ref `fsztsmnxbffanyfbytnr`): lesbar, Daten NICHT als V2-identisch bestätigt.
- Drittes Projekt `WOODMO_V3.0` bisher NICHT erstellt: kostenlose Zwei-Projekte-Grenze.
- **Es gibt noch keine freigegebene, isolierte V3-Produktivdatenbank.**

## Lesende Bestandsaufnahme: Test-Holz-Bar-Kasse
Stand: 2026-11-12, PostgreSQL; keine geheimen Werte oder Mitarbeiterdaten im Protokoll.

| Bereich | Aktive Einträge | MD5-Gruppenfingerprint (sortierte ID:Inhalt-Fingerprints) |
|---|---:|---|
| catalog/category | 5 | cc5ecdcfaac6d1bd64709aafdce5e930 |
| catalog/product | 53 | ec2eac14b84fabc01e391d4c207acac5 |
| catalog/setting | 2 | 4b6ad4009cda4e9bed53c7fb8e57ef6c |
| staff/active | 3 | 862ee673b0aba531c653bf87dba31370 |
| staff/security | 3 | b6496f01b73c2aa1b6c02d82de3e8dcc |
| storage/article-images | 196 | 2ff17b89a0ead0ac07bbd75106eacf31 |

Fingerprint ist ausschließlich ein pragmatischer Änderungsindikator, kein Kryptografie- oder Sicherungsbeweis. Storage-Fingerprint enthält Namen und Metadaten, **nicht** Bilddatei-Bytes.

- Alle 53 aktiven Produkte besitzen Felder für beide Standortpreise (Friedrichshafen/Bregenz), Steuerklasse, Bildreferenz, Kategorienverweis und Namen.
- Keine aktiven Artikel mit fehlendem Kategorienverweis oder fehlenden Standortpreis-Feldern gefunden. Weder Betragsrichtigkeit noch echte Bildverfügbarkeit sind damit bewiesen.
- Zehn `public`-Tabellen vorhanden; RLS jeweils aktiv. Die geprüften RLS-Policies auf Kassen- und Stammdatentabellen sind auf eine spezifische Supabase-Auth-Identität eingeschränkt. **Die Identität müsste bei Projektwechsel angepasst werden.**
- Vorhandene RPCs u. a. `import_pos_catalog`, `reset_pos_bookings_v2`, `issue_pos_daily_close_receipt`, `configure_staff_security`. Parameter stimmen mit geprüften Aufrufen grundsätzlich überein.
- Funktions-/Berechtigungsprüfung und End-to-End-Buchungstests noch nicht abgeschlossen.

## Code und Bereitstellung
- V3-Branch von `woodmo-entwicklung` angelegt. **Noch kein V3-Quellcode aus der lokalen Testkopie übernommen.**
- Lokale Testkopie: `C:\Users\szmai\Desktop\WOODMO_3_TEST`, nicht direkt aus diesem Chat erreichbar.
- Vorherige lokale Windows-Prüfung eines Zwischenstands: TypeScript und Vite-Build erfolgreich, Rechen-/Berichtsskripte erfolgreich; ESLint 16 Fehler und 6 Warnungen (vor späteren lokalen Korrekturen).
- Spätere kombinierte ZIP-Pakete und PWA-Erweiterungen sind hier noch NICHT vollständig mit Build, Browser oder Samsung Galaxy A11 validiert.
- Die V3-PWA soll einen Installationshinweis anbieten; native Installation hängt vom Browser und Installierbarkeitskriterien ab.

## Historie
| ID | Aktion | Ergebnis | Datenänderungen |
|---|---|---|---|
| PRE-001 | Branch woodmo-v3.0 erstellen | Erfolgreich | Keine |
| PRE-002 | Eigenes Supabase-V3-Projekt erstellen | Abgelehnt: Free-Plan-Limit | Keine |
| PRE-003 | V2-Projekt lesend prüfen | Connection-Timeout | Keine |
| PRE-004 | Testprojekt: Schema, Katalog, Personal-/RPC-Struktur lesen | Erfolgreich | Keine |
| PRE-005 | Katalog-, Personal- und Storage-Fingerprints erzeugen | Erfolgreich | Keine |
| PRE-006 | RLS-Policies / sensible RPC-Ausführungsrechte lesen | Erfolgreich; gezielte Benutzerrechte, weiter zu validieren | Keine |
| PRE-007 | Dieses Protokoll im ausschließlich V3-Branch erfassen | Erfolgt in diesem Commit | Keine |

## Zwingend vor Übertragung
1. Tatsächlich aktive V2-Datenquelle klären, vollständigen aktuellen Stammdatensatz sichern.
2. Geeignete getrennte V3-Datenbank und eigene Auth-/RLS-Konfiguration festlegen.
3. Stammdaten, SCHUSS, Sicherheits-/Mitarbeiter-Konfiguration und alle Bilder kontrolliert übertragen (geheime Werte nur über sichere Verfahren).
4. Auf beiden Seiten gleiche IDs und Inhalts-Hashes, Bild-Bytes und Berechtigungen prüfen; Abweichungen ausschließlich für V3-spezifische Felder zulassen.
5. Neu-Buchungen, Tagesabschluss, Pfand, Login, Synchronisierung, PWA und PC/Tablet testen; danach Produktivfreigabe.

**Weder V2-Produktivdaten noch Testdaten wurden bei dieser Vorprüfung mutiert.**
