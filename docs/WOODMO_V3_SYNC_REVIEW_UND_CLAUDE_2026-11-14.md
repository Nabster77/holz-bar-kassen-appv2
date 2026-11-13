# WOODMO V3 – Synchronisation, Standortkassen und Claude-Audit (14.11.2026)

## Verbindliche Nutzeranforderung
- **Friedrichshafen (DE)** und **Bregenz (AT)** besitzen je eine unabhängige Kasse. Je Standort maximal eine offene Kassensitzung; beide können gleichzeitig offen sein.
- Abschluss/Neueröffnung eines Standortes dürfen den anderen nicht verändern. Offene Kassen müssen über Nacht und nach App-Neustart fortgeführt werden.
- Aktiver Modus: lokale Speicherung sämtlicher zwingend benötigter Buchungsdaten und offline beständige Warteschlange, später automatischer Cloud-Upload und Pull ohne Doppelbuchung/Verlust.
- Testmodus: simulierte Buchungen ohne Cloud-Persistenz.
- Regelmäßiger Sync sowie manueller Sync; Geräte müssen Kassen-/Katalogdaten konsistent abgleichen. GitHub ist Code-Repository, **keine Laufzeit-Buchungsdatenbank**.
- Stammdaten (Artikel, Warengruppen, Preise, DE/AT-Steuer, Pfand, Bilder, SCHUSS, Mitarbeiter, Einstellungen) bleiben bei Buchungs-Reset erhalten.
- Vor einem bewusst gewählten ersten Teststart wird neutraler Buchungsstand gewünscht; **nicht** bei jedem App-Neustart automatisch löschen.
- Historische Originalbons und Stornonachweise bleiben unveränderlich; Storno der letzten fünf Originalbons; Offline-Storno nur Simulation, keine unbestätigte Live-Stornierung.
- Nach lokaler Abnahme soll **Claude AI Free nur den bestehenden Code prüfen**, keine Neuprogrammierung/Änderung/Deployments. Ergebnis: kopierbarer, strukturierter Befund samt minimalen optionalen Patches für ChatGPT.

## Reproduzierter Fehler
V3 lokaler Server `http://127.0.0.1:5183/`: Synchronisierung meldet `duplicate key value violates unique constraint "pos_cash_sessions_one_active_per_location_v3"`.
Die V3-Testcloud enthielt eine offene Friedrichshafen-Sitzung vom 13.11.2026; der bisherige Client berücksichtigte für die Kassenauswahl nur **heutige** Sitzungen. Die DB-Unique-Constraint ist ein notwendiger Schutz gegen doppelte Öffnung pro Standort, kein Grund zum Entfernen der Constraint.

## Umgesetzte begrenzte Codeänderungen (nur `woodmo-v3.0`)
1. `src/hooks/useStore.ts`: neueste Kassensitzung **standortbezogen über Tagesgrenzen** statt nur für heutigen Tag; bewusste Standortauswahl wird nicht mehr überschrieben; doppelte Öffnung desselben Standorts lokal blockiert.
2. `src/App.tsx`: vor online Kasseneröffnung per Standort Cloud-Sitzung prüfen; vorhandene offene Sitzung in lokalen Zustand lesen und zugehörigen Standort auswählen; bei Cloud-Lesefehler keine neue Eröffnung.
3. `src/components/POS/POSScreen.tsx` und `CashOpeningDialog.tsx`: Cloud-Prüfung vor UI-Schließen abwarten; Fehler im Dialog anzeigen; mehrfachen Klick während Öffnung verhindern.
4. `src/lib/outbox.ts`: bei kollidierender Offline-Kassenöffnung keine Buchungen verwerfen oder fremde Kassen überschreiben; Fehler mit Kennungen anzeigen; Sessions vor Transaktionen synchronisieren. Vorhandene Generation-/Resetprüfung bleibt erhalten.
5. `scripts/check-v3-cash-menu.mjs`: statischen UI-Test an das asynchrone bestätigte Öffnen angepasst; echte Tests müssen weiterhin erfolgreich laufen.

**Keine** Supabase-Migration, Buchungs-Löschung, Reset, Änderungen auf `main` oder Live-Deployment durchgeführt.

## Wichtige Grenzen/offene Risiken
- Eine zweite **offline** eröffnete Kasse desselben Standorts kann erst beim Reconnect kollidieren. Ohne bestätigte serverseitige Entscheidung dürfen die beiden Kassen nicht stillschweigend zusammengeführt werden. Konfliktdatensätze bleiben erhalten; gesonderter Recovery-/Archiv-Workflow erforderlich.
- Noch keine vollständige serverseitig atomare Eröffnung mit Transaktions-/Session-Commit nachgewiesen; Vorabprüfung allein verhindert kein Rennen zweier Online-Geräte, die DB-Constraint bleibt letzte Schranke.
- Offene Kassensitzungen enthalten veränderliche Einlagen/Entnahmen/Aktivitäten: das bisherige `mergeCloudData` übernimmt cloudseitig hauptsächlich abgeschlossene Sessions. Mehrgeräte-Konflikte während derselben offenen Sitzung benötigen versionierte/atomare Ereignis-Synchronisation, bevor „vollständig zuverlässig“ attestiert werden darf.
- `src/lib/storage.ts` schreibt lokale JSON-Daten in localStorage; Fehler beim Speichern werden derzeit unterdrückt. Outbox-IndexedDB ist persistent, aber Offline-Dauerhaftigkeit bei Quota-/Speicherfehlern und Browserdatenlöschung benötigt einen eigenen Test und ggf. Fehleranzeige.
- Die am 13.11.2026 in der Cloud vorhandene **eine** Transaktion und **eine** offene Kassensitzung wurden nicht verändert. Lokale stale Outbox kann weiterhin echten Konflikt melden. Vor frischem Test muss sicher, mit überprüftem Backup/Generation, abgeglichen werden; keine automatische Löschung.
- GitHub-CI-/Typecheck-/Test-/Build-Resultate und Notebook-End-to-End-Test separat dokumentieren. Ein grüner CI-Lauf belegt noch keinen erfolgreichen Online-/Offline-Praxistest.

## Erforderliche Abnahme
1. Auf aktuellem V3-Commit `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run lint`.
2. Cloud-Sitzung vom Vortag ohne zusätzliche Eröffnung fortführen.
3. FH + Bregenz parallel öffnen; eine schließen und dieselbe erneut eröffnen; fremde bleibt aktiv.
4. Bar/Karte/Einlage/Entnahme/Pfand/Kassenbestand (nie negativ); Offline-Verkäufe, Neustart, Reconnect, zweites Gerät und korrekte IDs/Beträge.
5. Kollision eines zweiten offline geöffneten Standortes → nicht verlustbehaftet und nicht als erfolgreich synchronisiert darstellen.
6. Storno, Rückrechnung, Berichte, Tagesabschluss und Export/Import/Reset gesondert abnehmen.

## Nachtrag: 14.11.2026 – Behandlung des vorhandenen Konflikts
- Die V3-Cloud enthält eine offene Friedrichshafener Sitzung mit 200,00 EUR Anfangsbestand und eine zugehörige Buchung über 19,00 EUR. Diese Cloud-Belege werden ausdrücklich **nicht gelöscht**.
- Die erneute Synchronisierungsfehlermeldung identifiziert zwei unterschiedliche Sitzungs-IDs (Cloud und lokal). Das ist nach der neuen Kollisionssperre ein korrekt erkannter, noch ungelöster Konflikt.
- `src/components/SyncDialog.tsx`: Schaltfläche **„Doppelte Kassenöffnung sicher prüfen“** erscheint bei spezifischem Kassensitzungskonflikt.
- `src/App.tsx`: Abgleich der aktiven Cloud-Sitzung, konservative Prüfung aller lokalen Verkäufe/Kassenbewegungen und Bestätigung inklusive Anfangsbeständen. Ohne positive Bestätigung wird nichts geändert.
- `src/lib/outbox.ts`: Nur Warteschlangeneinträge einer nachweislich unbenutzten lokalen Doppelöffnung dürfen nach gesicherter Archivierung selektiv entfernt werden; vorhandene Buchungen/Bewegungen blockieren die Übernahme.
- `src/hooks/useStore.ts`: Ersetzen ausschließlich dieser unbenutzten lokalen Öffnung durch die originale aktive Cloud-Sitzung.
- Vor dem selektiven Entfernen wird ein vollständiger Konflikt-Snapshot (`woodmo_v3_conflict_archive_...`) im Browser-LocalStorage gespeichert und lesend verifiziert. Andere Offline-Transaktionen und andere Standorte bleiben unverändert.
- Wenn die lokale Kasse bereits eigene Verkäufe oder Bargeldbewegungen besitzt, bleibt sie und ihre Queue erhalten; die Übernahme muss dann gesondert manuell geklärt werden. Es gibt keine heimliche Umhängung lokaler Bons oder Änderung von Anfangsbeständen.
- Nach erfolgreicher Übernahme manuell **„Erneut versuchen“** klicken und die Daten mit dem V3-Cloudstand überprüfen. Funktions-/Echtgerätetest steht noch aus.
- Der Konflikt-Snapshot ist **kein Ersatz** für ein extern gespeichertes, geprüftes vollständiges Backup; Browserdaten dürfen weiterhin nicht gelöscht werden.
