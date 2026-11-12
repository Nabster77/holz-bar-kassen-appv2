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

## Nachtrag 2026-11-12 – Vertiefte Prüfung (PRE-008 bis PRE-013)

| ID | Prüfschritt | Ergebnis | Schreibzugriff |
|---|---|---|---|
| PRE-008 | Aktive Artikel gegen Storage-Dateireferenzen prüfen | 53/53 referenzierte Dateien im Bucket `article-images` gefunden; Bildbytes selbst noch nicht verglichen | Nein |
| PRE-009 | Standortpreise prüfen | Für 53/53 Artikel sind `prices.Bregenz` und `prices.Friedrichshafen` vorhanden; keine fehlenden Kategorien oder Steuerklassen | Nein |
| PRE-010 | Postgres Policies/privilegierte Funktionen prüfen | RLS aktiv; Policy-Zugriffe in wesentlichen Tabellen an konkrete Auth-UID gebunden. Beim Klonen muss die neue Auth-UID konfiguriert werden | Nein |
| PRE-011 | Supabase Security Advisor | Warnung: `public.rls_auto_enable()` als `SECURITY DEFINER` für `anon` aufrufbar; weitere Hinweise zu `authenticated`-RPCs. Sicherheit vor Produktionsfreigabe untersuchen, **keine blinde Änderung** | Nein |
| PRE-012 | V2-Projekt-Abfrage & Wiederherstellungsversuch | Plattform meldete Projekt zuvor als `hibernated` und später `ACTIVE_HEALTHY`; Restore-Aufruf meldet „nicht länger pausiert“, SQL-Zugriff bleibt wegen Timeout nicht möglich | Keine bestätigte Datenänderung; Restore angestoßen/abgewiesen |
| PRE-013 | Kombiniertes ZIP lokal prüfen | Build in isolierter Prüfumgebung blockiert: npm-Registry nicht erreichbar (`EAI_AGAIN`); erfolgreiche Windows-Builds beziehen sich auf früheren Stand | Nein |

**Sperren:** V2-Quelle nicht auslesbar, Datenbankisolation V3 ungeklärt, kein vollständiger Code-Build des letzten Gesamtstands, Bildbytes nicht geprüft, reale PC-/Tablet-Synchronisierung nicht geprüft. Datenmigration/Reset/Produktivschaltung bleiben untersagt.

**Sicherheitshinweis:** [Supabase RLS-/RPC-Sicherheitswarnungen](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). Ein Warnhinweis ist noch kein Nachweis einer ausnutzbaren Schwachstelle; Rechte und Funktionskörper müssen vor einem Eingriff geprüft werden.

## Nachtrag 2026-11-12 – Kritische Datenbanktrennung (PRE-014)

**Read-only Abfrage der aktiv genutzten Datenbank `Test-Holz-Bar-Kasse`** (Ref `fsztsmnxbffanyfbytnr`):

| Tabelle | Zeilen (einschließlich gelöschter/älterer Datensätze) | Neuester `synced_at` (UTC) |
|---|---:|---|
| `pos_catalog_items` | 77 | 2026-11-10 10:08:31 |
| `pos_staff_users` | 33 | 2026-11-10 17:49:51 |
| `pos_cash_sessions` | 13 | 2026-11-12 18:00:32 |
| `pos_transactions` | 17 | 2026-11-12 17:54:45 |

Diese **heutigen Schreibzugriffe** zeigen, dass die Datenbank aktiv benutzt wurde. Das ist **kein Beweis, welche Version** geschrieben hat. Ohne identifizierte Datenbank-URL der tatsächlich veröffentlichten V2 darf dieses Projekt **weder zurückgesetzt noch exklusiv der V3 zugeordnet werden**. Nutzerziel: V3-Stammdaten 1:1, aber unabhängige neue Buchungen; deshalb ist Datenbankisolation eine zwingende Voraussetzung.

**Nächster notwendiger Eingriff durch Benutzer:** In der lokalen V2-Konfiguration ausschließlich die Supabase-Projekt-Referenz (Host aus `VITE_SUPABASE_URL`) ausgeben, **niemals Schlüssel oder Passwörter**. Zusätzlich ggf. veröffentlichten V2-Build auf tatsächlich verwendete Referenz prüfen. Erst nach Nachweis eine V3-Datenbank auswählen. Kein V3-Datenbankwrite durchgeführt.

## Nachtrag 2026-11-12 – API-Zuordnung und wieder erreichbares Projekt (PRE-015)

- Benutzer stellte eine Supabase-REST-URL und einen **Publishable Key** für Projekt `tulndunkpsynkbbebenf` bereit. Die Schlüsselzuordnung wurde über Supabase-Projekt-API bestätigt. **Kein Key wird in diesem öffentlichen GitHub-Repository gespeichert.**
- Das zuvor nicht erreichbare Projekt `Holz-Bar-Kasse` antwortet jetzt auf schreibgeschützte SQL-Abfragen.
- **Istbefund `Holz-Bar-Kasse`:** 0 Tabellen im Schema `public`, 0 öffentliche RPC-Funktionen, 0 Storage-Buckets, 0 Storage-Objekte; **2 Supabase-Auth-Benutzer vorhanden**. Das Projekt ist daher nicht völlig leer und darf nicht ohne Prüfung als V3-Ziel neu initialisiert werden.
- **Istbefund `Test-Holz-Bar-Kasse`:** 53 aktive Produkte, 5 Kategorien, 2 aktive Einstellungen sowie 196 Storage-Objekte; die letzten Katalogänderungen datieren auf 2026-11-10. Das ist die bisher beste belegte Stammdatenquelle.
- Die GitHub-Pages-V2-Deployment-Pipeline verwendet `vars.VITE_SUPABASE_URL` und `secrets.VITE_SUPABASE_ANON_KEY`; diese Werte sind **nicht** in den lesbaren Quelltexten hinterlegt. Der aktuell verwendete V2-Endpunkt muss vor Projektumwidmung zweifelsfrei identifiziert werden. Zwei Auth-Benutzer im unbenutzten Schema sind ein zusätzlicher Grund zur Vorsicht.
- **Aktiv keine Buchungen löschen und keine bestehende Datenbank umbenennen, reinitialisieren oder als Ziel beschreiben.** Erst nach Zielbestätigung Schema-/Auth-Einrichtung und gesicherter Katalogimport.

## Nachtrag 2026-11-12 – TATSÄCHLICHE V3-Zielmigration (MIG-001 bis MIG-009)

**Achtung: Die früheren Vorprüfungen oben dokumentierten einen damals noch nicht migrierten Zustand. Dieser Nachtrag ist der neue maßgebliche Status.**

- **Ziel**: Supabase `Holz-Bar-Kasse` / `tulndunkpsynkbbebenf`, vom Nutzer zur V3-Grundeinrichtung freigegeben. 2 bestehende Supabase-Auth-Identitäten wurden weder gelöscht noch geändert. Identisches Login (E-Mail-Fingerprint) von Quell-Administrator im Ziel bestätigt; Ziel-Auth-UUID ist unterschiedlich. Keine Anmeldedaten im GitHub-Protokoll.
- **Quelle**: `Test-Holz-Bar-Kasse` / `fsztsmnxbffanyfbytnr` mit aktiv genutzter V2. Ausschließlich SELECT-Abfragen, keine Quell-Datenänderung.
- **MIG-001**: 10 historische SQL-Migrationen zu Bildbucket, Buchungen, Kassen und Zugriffskontrolle als `woodmo_v3_base_schema_and_acl` erfolgreich auf leeres Ziel angewendet. Hardcodierte V2-Auth-UUID in Ziel-ACL auf bereits vorhandenes V3-Admin-Konto umgesetzt.
- **MIG-002**: 8 Migrationen zu Admin-Zugang, Katalog-Sync, Reset und Generationsschutz als `woodmo_v3_catalog_reset_and_admin_acl` erfolgreich.
- **MIG-003**: 6 Migrationen zu Mitarbeitern, Sicherheitsfragen und Tagesabschlussbelegen als `woodmo_v3_staff_and_close_receipts` erfolgreich.
- **MIG-004**: 5 Migrationen zu Datenwiederherstellung, Löschung von Mitarbeiter-Anmeldedaten, leeren Sitzungen und Katalogimport als `woodmo_v3_backup_staff_and_catalog_import` erfolgreich. Historische explizite BEGIN/COMMIT-Marker entfernt, da die Migration als einzelne Transaktion angewendet wurde.
- **MIG-005**: Erste Übernahme versuchte auch einen bestehenden Verwaltungspasswort-Eintrag zu übernehmen; **UNIQUE-Konflikt**, PostgreSQL hat die komplette Datenübernahme transaktional zurückgerollt. Prüfwerte unmittelbar danach: 0 Katalog, 0 Mitarbeiter, 0 Sicherheitsfragen, 1 vorhandener Verwaltungspasswort-Eintrag, 0 Buchungen. **Kein Teilimport**.
- **MIG-006**: Wiederholung ohne Überschreiben des bestehenden Verwaltungspasswort-Eintrags als `woodmo_v3_import_catalog_staff_security` **erfolgreich**. 77 Katalogzeilen inkl. 53 aktiver Produkte, 5 aktiver Kategorien, 2 aktiver Einstellungen und Löschmarkierungen; 33 Mitarbeiterzeilen (3 aktiv), 3 getrennte Sicherheitsfragen/Prüfwerte.
- **MIG-007: 1:1-Hashvergleich** der kompletten Tabellen inklusive Metadaten/Soft-Deletes erfolgreich:
  - `pos_catalog_items`: 77/77, MD5 `0366d8ad2c4940f468dbab20f312ac8e`
  - `pos_staff_users`: 33/33, MD5 `3ef8916762553654e2fb6da66463e12f`
  - `pos_staff_security`: 3/3, MD5 `4098f6c8fed191d7461584a94f727ad7`
  - **V3-Buchungen 0 und V3-Kassensitzungen 0** (Quelle 17 Buchungen und 13 Kassensitzungen zum Prüftermin). Keine alten Beleg-/Buchungsdaten übernommen. MD5 ist ein pragmatischer Vergleich, kein kryptografischer Herkunftsnachweis.
- **MIG-008**: Temporäre, JWT-geschützte Supabase-Edge-Funktion für Bildtransfer bereitgestellt, aber der automatische Auslöser wurde durch eine Sicherheitsprüfung blockiert; **kein Bildtransfer erfolgt**. Unmittelbar danach als harmlose, nur HTTP 410 liefernde Funktion **Version 2 deaktiviert**. `pg_net` in V3 installiert, aber nicht verwendet. Keine Quelländerung. V3-Storage-Bucket vorhanden, zunächst 0 Dateien.
- **MIG-009**: Bild-Upload-Berechtigung in V3 auf authentifiziertes Admin-Konto beschränkt; öffentlicher Lesezugriff für Produktbilder bleibt. Zusätzlich RLS und Entzug direkter Clientrechte für `pos_daily_close_receipt_counters` aktiviert (intern ausschließlich via geschützte RPC).
- **Bilder**: In V2 sind **53 eindeutige, vorhandene und typgeprüfte Produktdateien** (PNG/JPG/WebP), V3-Artikel referenzieren bis zur echten Dateiübertragung noch V2-Bild-URLs. Ein lokal ausführbares Windows-Paket `WOODMO_V3_53_Bilder_Transferpaket.zip` mit 53-Datei-Manifest, Download, Sicherungs-ZIP, Upload per bestehendem Supabase-Admin-Login und SHA-256-Vergleich wurde erstellt; es wurde **noch nicht am Windows-Rechner ausgeführt**.
- **Nächster notwendiger Schritt des Nutzers**: ZIP entpacken, `WOODMO_V3_53_Bilder_STARTEN.cmd` starten und Passwort des bestehenden Supabase-Kontos `admin@kasse.local` **nur lokal** eingeben. Danach Erfolgsanzeige 53/53 oder Fehlermeldung (keine Zugangsdaten) mitteilen.
- **Danach durch Assistent**: Zielstorage prüfen, ausschließlich im V3-Ziel die vorbereitete, durch 53-Datei-Vollständigkeit abgesicherte `docs/sql/WOODMO_V3_BILDURL_UMSTELLUNG_NACH_TRANSFER.sql` anwenden, anschließend 53/53 neue Bildadressen und Buchungsleere erneut prüfen, V3-App-Code/Ziel-URL/Browser testen.

**Nicht erledigt**: Vollständige Bildkopie, reale Android/PC-Abnahme, finaler V3-GitHub-Quellcode-Upload, getrennte V3-Webveröffentlichung. Bitte diese Schritte niemals als abgeschlossen darstellen.

## Nachtrag 2026-11-12 – 53/53 Bilder übertragen und V3-Bildadressen aktiv

Der Benutzer bestätigte den erfolgreichen lokalen Windows-Transfer: **53/53 Bilddateien**, SHA-256 auf Quell- und Zielseite identisch. Lokales Quellbild-Archiv: `WOODMO_V3_Bilder_53_Sicherung_20261112_202444.zip`; lokales Prüfprotokoll: `Zielpruefung_SHA256.csv`. Diese Windows-Dateien wurden dem Assistenten nicht als Bytes hochgeladen; die Prüfsummenbestätigung beruht auf dem protokollierten Ergebnis des Benutzer-Skripts.

Eine zwischenzeitlich ausstehende URL-Migration wurde über Supabase vor einem erneuten Schreibzugriff direkt geprüft: **53 aktive Produkt-URLs zeigen auf das V3-Projekt `tulndunkpsynkbbebenf` und 0 zeigen auf das ehemalige Quellprojekt**. Damit ist die Bildadressenumstellung bereits erfolgt. Keine erneute Migration nötig, um Doppeländerung zu vermeiden.

Unabhängige Read-only-SQL-Prüfung im V3-Ziel: **53 aktive Produkte, 53 eindeutige Bildreferenzen, 53/53 dazu passende Storage-Objekte, 53 Storage-Dateien insgesamt; 5 aktive Kategorien, 2 aktive Einstellungen, 3 aktive Mitarbeiter, 0 Transaktionen, 0 Kassensitzungen**. Bereits früher: vollständiger Katalog und Mitarbeiter-Sicherheitstabellen übertragen. Der Benutzer hat die Berechtigung für die vereinbarten V3-Arbeiten nochmals ausdrücklich bestätigt. Plattformseitige Sicherheits- und Bestätigungsschritte bleiben einzuhalten.

**Noch offen**: V3-GitHub-Anwendungscode final bereitstellen, V3-Seite eigenständig veröffentlichen, Funktionstests der App auf PC und Tablet, Prüfung Verwaltungspasswort/Benutzerzugang und Export/Import-Endabnahme.


## Nachtrag 2026-11-12 – Beginn Entwicklung nach Nutzerfreigabe (DEV-001)

Der Nutzer hat die Umsetzung der vereinbarten V3-Anforderungen schrittweise autorisiert. Die zuvor festgelegten Phasen-Grenzen gelten weiter: **kein lokaler Praxistestserver, keine eigenständige öffentliche Veröffentlichung und kein Live-Datenbankexperiment ohne separate Freigabe**.

**Umgesetzt im Branch `woodmo-v3.0`:**
- `src/lib/stornoRules.ts`: reine Stornoregeln (letzte fünf, offene Sitzung, Standort, Pflichtbegründung, Bargeldschutz, Bar-/Kartenwirkung, unveränderte Ursprungsbelege).
- `scripts/check-storno-rules.mjs`: Regressionstests für Storno-Regeln; ebenfalls `package.json` integriert.
- Isoliert ausgeführt: strenge TypeScript-Prüfung des Regelmoduls und Storno-Regressionstests → bestanden. Vollständiger Projekt-Build noch nicht nachgewiesen.
- `docs/WOODMO_V3_STORNO_ARCHITEKTUR.md`: atomare Speicherung, Rechte, Audit- und Aufbewahrungsanforderungen.
- `supabase/migrations/20261112213500_create_v3_storno_audit_draft.sql`: SQL-Schema für unveränderliche Stornobelege als **Entwurf im Code, nicht in der Datenbank angewandt**. Eine geschützte Schreib-RPC und Ende-zu-Ende-Integration sind **noch offen**.
- `.github/workflows/woodmo-v3-ci.yml`: Branch-spezifische Code-Prüfung mit `npm ci`, Typecheck, Tests, Build und Lint; **ohne Deployment**. GitHub-Actions-Ausführung/Erfolg wurde hier noch nicht verbindlich bestätigt.
- `docs/WOODMO_V3_ENTWICKLUNG_EINTRITTSPRUEFUNG_2026-11-12.md`: detaillierter Prüfeinstieg.

**Bereits im Code enthalten, derzeit nicht dupliziert:** manuelle PDF-Archivordnerwahl und IndexDB-Speicherung, Jahres-/Standort-/Berichtsordner, Backup-Konfliktfilter. Die Erststart-Setup-Oberfläche, Storno-UI, automatische Cloud-PDF-Archivierung und sichere Ordner-/BAT-Routinen sind weiterhin offen.

**Nächster Entwicklungsschritt:** isolierte Prüfung des append-only Storno-Schemas, atomarer Storno-RPC, anschließend Integration der Storno-Gegenbewegungen in alle Report- und Tagesabschlussrechner sowie PDF. Erst danach Geräte-Setup und gestaltende Feinschliffe.
