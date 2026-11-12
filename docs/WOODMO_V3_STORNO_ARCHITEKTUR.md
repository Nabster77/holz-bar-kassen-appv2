# WOODMO V3.0 – Storno: sichere Architektur vor Integration

Status: **Entwurf, nicht produktiv aktiviert**. Implementierte Regelbasis `src/lib/stornoRules.ts`; gezielte Tests `scripts/check-storno-rules.mjs`.

## Geschäftsregeln und Berechnungen

1. **Fünferfenster ist rein vorübergehend, die Bons nicht:** Immer die fünf neuesten **aller** Einzelbons einer offenen Kassensitzung am selben Standort bestimmen. Ein bereits stornierter Bon belegt weiterhin einen Platz, bleibt aber nicht erneut stornierbar. Es darf deshalb **kein älterer Bon nachrücken**. Ein sechster neuer Bon verdrängt den ältesten. Alle Originalbons werden von der ersten Buchung an dauerhaft gespeichert.
2. Vor Storno: Originalbeleg vollständig anzeigen, Begründung verlangen, Mitarbeiter und Zeitpunkt festhalten, explizite Bestätigung.
3. Storno erzeugt einen **zusätzlichen unveränderlichen** Eintrag mit Originalbeleg-ID, eigenständiger Storno-ID, Grund, Mitarbeiter, Zeit, Ort, Zahlungsart, Steuerpositionen, Beträgen, Original-Snapshot.
4. Originalbuchung niemals physisch entfernen oder überschreiben. Der wirksame Umsatz und die Artikelstatistik werden über Original minus Storno abgeleitet; das Journal muss **beide** Ereignisse lesbar und referenziert enthalten.
5. Barstorno: Gegenbewegung von `original.total` (einschließlich Pfand) in Cent; Bargeldbestand darf nicht negativ werden. Kartenstorno: Gegenbewegung im Kartenumsatz, **keine** Behauptung einer externen Kartenerstattung.
6. Steuerbeträge und Pfandpositionen aus dem unveränderten Original spiegeln; nicht aus dem jeweils aktuellen Artikelkatalog oder aktuellen Steuersätzen neu berechnen.
7. Nach endgültigem Abschluss darf nicht in die bereits unveränderliche PDF/Snapshot-Summe zurückgeschrieben werden; spätere Korrektur gesondert aufzeichnen und im aktuellen zulässigen Zeitraum ausweisen.
8. Nur einen Storno pro Originalbeleg; mehrere Geräte, Enter-Doppelklicks und Wiederholungsanfragen müssen serverseitig atomar/idempotent behandelt werden. Die lokal abgeleiteten Regeln allein schützen nicht vor zwei Geräten.
9. Vor RPC-Aufruf ausstehende Offline-Buchungen und den Kassenstand synchronisieren. Server muss Zustand erneut validieren. In der App sollten Stornos **nicht** frei offline angenommen werden, solange eindeutige Serverbestätigung nicht verfügbar ist.
10. Personalrechte müssen serverseitig ausreichend nachgewiesen werden; der derzeitige gemeinsame Supabase-Login kann individuelle Mitarbeiteridentitäten nicht allein authentisieren. Eine reine Client-Rollenabfrage genügt nicht.

## Endgültiger Tagesabschluss und Datenaufbewahrung

- Beim endgültigen Tagesabschluss endet das vorübergehende Storno-Auswahlfenster für diese Sitzung.
- **Alle** verkauften Bons dieser Kassensitzung sind im dauerhaften Abschluss-Snapshot enthalten – ausdrücklich auch die neuesten fünf und ältere stornierte Bons.
- Alle Stornos der Sitzung müssen zusätzlich mit Zeit, Grund, Benutzer, Standort und unverändertem Original-Snapshot in diesem Abschluss enthalten sein; nichts darf wegen der Fünferbegrenzung verworfen werden.
- Der bestehende Abschlussweg in `src/App.tsx` übernimmt bereits alle Sitzungsbuchungen und kennt **keine Begrenzung auf fünf**. Er kennt derzeit aber noch keinen persistierten Storno-Ledger.
- `prepareFinalCloseStornoSnapshot` in `src/lib/stornoRules.ts` erstellt und kontrolliert die vollständige Datenbasis, ist aber **noch nicht** an die echte atomare Cloud-Finalisierung angeschlossen. Keine produktive Nutzung freigeben, bevor sie verbunden und getestet ist.
- `scripts/check-storno-close-snapshot.mjs` prüft mit mehr als 1000 Bons die vollständige Übernahme, ältere Stornos, andere Standorte, zeitliche Grenzen und Unveränderlichkeit.
- Die Sperre für Stornos gilt nur in der **offenen** Sitzung und ist kein Lösch- oder Aufbewahrungskonzept.

## SQL-Datenmodell (nach Analyse zu implementieren)

- Eigene, append-only `pos_stornos` mit eindeutiger Originalbeleg-ID und eindeutiger Vorgangs-ID.
- Gespeicherte Originalbeleg-Metadaten und nach Möglichkeit Original-Snapshot für sichere historische Lesbarkeit.
- RLS aktiv, direkte UPDATE/DELETE und anonyme Zugriffe untersagen.
- Kontrollierte, authentifizierte RPC mit transaktionaler Prüfung: Original vorhanden, Standort, Session offen, letzte fünf, kein Doppelstorno, berechtigter Mitarbeiter, Cloud-Buchungs-Generation, Bargeldbestand.
- Indizes für Journal: Ort + Zeit, Original-ID, Kassen-Generation.
- Bei Buchungs-Reset dürfen steuerlich aufbewahrungspflichtige Original- und Storno-Unterlagen nicht spurlos verloren gehen. Vor einer Datenbank-Resetänderung ist ein gesondertes Aufbewahrungs-/Archivierungskonzept nötig.
- Neue Tabellen/RPCs **nur in der vorbereiteten V3-Testumgebung nach isolierter Prüfung** migrieren; keine laufende Kasse testweise zurücksetzen.

## Testabfolge

A. Pure Cent-Berechnung und Kandidatenwahl (bereits bestanden).
B. SQL-Transaktion und race-condition Tests mit zwei gleichzeitigen Anfragen.
C. Ausgangsdaten bar/karte/pfand/mehrere Steuersätze und entsprechend spiegelnde Stornos.
D. Kassenbestand, Auswertungen, PDF, späterer Abschluss, Cloud-Reconnect und Backup/Restore.
E. Benutzerrechte, gesperrte/gelöschte Benutzer, mehrfacher Enter-Klick.
F. Separater Praxistest nach Nutzerfreigabe.

## Rechtliche Rahmenbedingungen

Deutschland: AO § 146 Abs. 4 untersagt Änderungen, bei denen ursprüngliche Inhalte nicht mehr feststellbar sind. Österreich: RKSV § 7 Abs. 2 verlangt, dass Stornobuchungen wie Barumsätze im Datenerfassungsprotokoll erfasst werden. Das ist die Begründung für **Gegenbuchung statt spurloser Löschung**.

Diese Prüfung ersetzt **keine** umfassende steuerrechtliche Abnahme des elektronischen Kassensystems.

## Geprüfter Stand der Sicherheitsvoraussetzungen (2026-11-12)

In V3 existieren für Mitarbeiterverwaltung bislang Funktionen zum Anlegen/Ändern und für Sicherheitsfragen, **aber keine RPC zur persönlichen serverseitigen Bestätigung einer Stornierung**. Die gemeinsame Supabase-Cloud-Anmeldung identifiziert daher noch nicht den jeweils stornierenden Mitarbeiter. Eine Server-RPC, die bloß `employee_id` aus einem Browserparameter übernimmt, ist **nicht ausreichend**. Vor Freischaltung ist ein tragfähiger individueller Berechtigungsnachweis erforderlich. Bis dahin bleibt die Storno-Schreibfunktion deaktiviert; keine direkten INSERT-Rechte für normale Browserclients.

Die reine Journalprojektion `salesLedgerMovements` führt `employeeName`, `employeeId` und `reason` auf Storno-Gegenbewegungen mit, damit die Informationen im künftigen Bericht/PDF nicht verloren gehen. Die Ergebnisse werden unter `scripts/check-storno-ledger.mjs` geprüft und über `npm test` ausgeführt.

## Fortsetzung: sichere Cloud-Schicht und Sitzungsbindung (2026-11-12)

Bereits im **V3-Entwicklungsbranch** umgesetzt, aber absichtlich **noch nicht in der Produktiv-App aktiviert**:

- `Transaction.cashSessionId` verbindet neue Verkaufsbons dauerhaft mit der geöffneten Kassensitzung. Bei alten Bons ohne Kennung bleibt die bisherige Zeit-/Standort-Zuordnung lesbar.
- `sessionTransactions`, `DailyCloseDialog` und die abschließende Beleg-Fixierung in `App.tsx` nutzen diese Zuordnung. Die Storno-Fünferauswahl und der vollständige Storno-Abschlusssnapshot ebenso.
- `supabase/functions/woodmo-v3-storno/passwordProof.ts` prüft den bisherigen PBKDF2-SHA256-Nachweis (210.000 Iterationen) auf dem Server anhand des persönlich eingegebenen Mitarbeiterpassworts; keine Neuanlage von Benutzerpasswörtern erforderlich.
- `supabase/functions/woodmo-v3-storno/index.ts` ist als Edge-Dienst vorbereitet: Supabase-Auth-Token validieren, Mitarbeiterstatus/Passwort kontrollieren und erst anschließend eine geschützte Datenbank-RPC aufrufen. Noch **nicht deployed**.
- `src/lib/stornoCloud.ts` implementiert den rein online vorgesehenen Aufruf mit **stabiler Storno-ID für idempotente Wiederholungen**. Stornos dürfen nicht in eine ungeprüfte Offline-Queue gelangen.
- `src/lib/stornoCodec.ts` validiert gespeicherte Cloud-Stornoeinträge einschließlich Belegidentität, Zahlungsart, Cent-Gegenbuchung und historischer Originaldaten.
- `docs/sql/WOODMO_V3_STORNO_SCHEMA_ENTWURF_NICHT_AUSFUEHREN.sql` enthält ein **nicht angewendetes** Append-only-Schema und eine service-role-beschränkte RPC mit Kassensitzungs-, Fünfer-, Generation-, Doppelstorno- und Kassenstandsprüfungen. **Sie liegt bewusst außerhalb `supabase/migrations`.**
- `scripts/check-storno-sql-staging.mjs` blockiert künftige CI-Checks, falls ein Storno-SQL-Entwurf vor Freigabe als ausführbare Migration abgelegt wird.

**Ausgeführte isolierte Node-/TypeScript-Tests:** PBKDF2-Mitarbeiternachweis, Cloud-Belegdecoder (inkl. Bar/Karte/Pfandretoure), Storno-Regelbasis, Journal-Zeitraumrechnung, Sitzungstrennung und Abschlusssnapshot mit mehr als 1.000 Buchungen bestanden. Diese Nachweise **ersetzen keinen** vollständigen App-Produktionsbuild oder einen atomaren Datenbank-Parallellauftest.

**Zusätzlich bestätigtes Sicherheitsrisiko in der derzeitigen Architektur:** Der gemeinsame Supabase-Cloud-Login `admin@kasse.local` darf gemäß den bestehenden RLS-Regeln `pos_staff_users` direkt schreiben und `pos_transactions` direkt anlegen. Daher kann eine persönliche Passwortprüfung für neue Stornos zwar als Zusatzbarriere dienen, ist aber **keine vollständige Manipulationssicherheit** gegen jemanden mit dem gemeinsamen Cloud-Zugang. Vor einer fachlichen Produktivfreigabe sind serverseitige Mitarbeiterrechte und die bisherigen direkten Tabellen-Schreibwege gesondert abzusichern; die bestehenden App-Anmeldeabläufe dürfen dabei nicht zerstört werden.

**Noch offene Abnahmepunkte:** Entwurf-RPC tatsächlich isoliert mit PostgreSQL und konkurrierenden Aufrufen testen; sichere persönliche Mitarbeiter-Autorisierung für Buchungsänderungen insgesamt; Stornobelege in Tagesabschluss/Journal/PDF/Backup-Ende-zu-Ende integrieren; Buchungs-Reset/Aufbewahrung regeln; vollständige Build-/Lint-/Regressionstests; erst dann Testserver und öffentliche Veröffentlichung nach Nutzerfreigabe.
