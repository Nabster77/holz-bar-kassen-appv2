# Neue verbindliche Regel: Administrator-Rücksetzung des gesamten Buchungsbestands
Stand: 2026-11-13. Gilt ausschließlich WOODMO V3. **Aktuell Entwurf/Implementierung im isolierten Prüfbranch, noch nicht freigegeben.**

## Fachregel
Ein Administrator darf auch während einer aktiven Kasse und nach einem Jahreswechsel den **gesamten Buchungsbestand** zurücksetzen, jedoch ausschließlich nach einer **vollständigen, dauerhaft gespeicherten und durch Rücklesen verifizierten Sicherung**. Keine pauschale Sperre wegen offener Kasse oder bestehendem Abschluss.

## Vor dem Zurücksetzen sichern
Die Sicherung enthält ALLE Datensätze und Detailinhalte aus:
1. `pos_transactions` (sämtliche Originalbuchungen, Belegpositionen und Beträge).
2. `pos_cash_sessions` (offene und abgeschlossene Sitzungen, Anfangs-/Endbestände, Geldbewegungen, Mitarbeiterprotokolle, endgültige Snapshot-Daten).
3. `pos_stornos` (Originalbezug, Grund, Zeitpunkt, Mitarbeiter, Beträge).
4. `pos_daily_close_receipts` (Abschlussbelege und Nummern).
5. `pos_daily_close_receipt_counters` (Nummernkreise).

Außerdem Reset-Generation, Standort, Exportdatum, Datensatzzahlen, Formatversion und SHA-256 des Backups protokollieren. Der Archivbestand muss nach dem Reset abrufbar und wiederherstellbar bleiben. Dass Browser einen Download **anstoßen**, beweist noch nicht, dass die Datei auf dem Dateisystem vorhanden ist. Verifizierbar ist z. B. erneutes Öffnen und Hash-Vergleich der geschriebenen Datei oder ein serverseitig dauerhaft hinterlegtes und erneut gelesenes Cloud-Archiv.

## Aktiver V3-Endmodus – entscheidende Freigaberegel
- Der spätere **Aktivmodus/Onlinebetrieb** DARF den ordnungsgemäßen Admin-Gesamtreset nicht durch einen pauschalen aktiven-Kasse-Sperrschalter blockieren.
- Eine **offene Kasse ist kein Verhinderungsgrund**, wenn der Administrator authentifiziert ist, das vollständige Buchungsbackup dauerhaft gespeichert und rücklesbar geprüft ist, die Geräte synchronisiert sind und der Datenstand bis zur atomaren Löschung unverändert blieb.
- Nach bestätigtem Reset werden aktive Kassen ausdrücklich beendet/invalidiert; eine neue Kasse muss mit neuem Anfangsbestand eröffnet werden.
- `src/lib/verifiedResetPolicy.ts` beschreibt diesen endgültigen Preflight; die bisherige Sperre `src/lib/bookingResetSafety.ts` betrifft nur den alten ungesicherten Reset-Aufruf, der im finalen Ablauf ersetzt wird.
- **Nicht als fertig behandeln:** Der geprüfte Cloud-Archivierungs-, Nachweis- und atomare Server-Reset-Workflow ist noch nicht verbunden.

## Obligatorischer Ablauf
1. Administrator authentifiziert sich (keine Mitarbeiterrechte).
2. Alle erreichbaren Geräte synchronisieren. Unbekannte Offline-Buchungen können NICHT garantiert archiviert werden: Geräte vor dem Reset ausdrücklich prüfen bzw. eine unvollständige Sicherung nicht als vollständig ausgeben.
3. Gesamten Buchungsstand konsistent erfassen, inklusive Stornos, Kassen und Abschlusszählern.
4. Sicherung dauerhaft schreiben, erneut lesen, **SHA-256 und Datensatzzahlen für alle fünf Bereiche prüfen**. Wenn irgendein Teil fehlschlägt: KEIN Reset.
5. Dem Administrator die geprüfte Sicherung, enthaltene Zahlen und Warnung zu aktiven/offline Geräten zeigen. Explizite endgültige Bestätigung.
6. Server prüft Autorisierung, Backup-Identität/Prüfsumme und ob der Datenstand seit der Sicherung geändert wurde; dann **atomar** Buchungsdaten entfernen, neuen Reset-Generationsmarker schreiben und ggf. Abschlusszähler neu beginnen. Scheitert ein Schritt, Transaktion komplett zurückrollen.
7. Storno-, Sitzungs- und Abschluss-Schutztrigger nur in dem gesondert autorisierten, überprüften Resetpfad kontrolliert behandeln, nie über einen ungeschützten DELETE. Stammdaten-Tabellen dürfen in dieser Transaktion nicht erwähnt werden.
8. Browser und Tablets übernehmen die neue Generation, verwerfen alte Cache-/Outbox-Datensätze und melden vorhandene alte Geräte deutlich. Nach Reset startet die Kasse ohne alten Bar-Anfangsbestand. Mitarbeiter-/Admin-Konten bleiben unverändert.
9. Archiv und Reset-Protokoll bleiben **außerhalb** des aktiven Buchungsbestands erhalten, um Prüfbarkeit und spätere Wiederherstellung zu gewährleisten.

## Unantastbare Stammdaten
`pos_catalog_items`, `pos_catalog_history`, `pos_staff_users`, `pos_staff_security`, Artikelbilder und Verwaltungs-/Standorteinstellungen NICHT löschen oder neu erzeugen.

## Wichtige Grenzen
- Der bisherige `reset_pos_bookings_v2` löscht den Buchungsbestand, verlangt aber keine beweisbar gespeicherte Sicherung und scheitert außerdem an Schutztriggern. Er ist **NICHT** die neue Funktion.
- Die V3-Prüfbranch-Sperre ist eine Übergangssicherung und muss nach Fertigstellung des verifizierten Administrator-Resets entfernt werden.
- Eine bloße automatische Supabase-Tagesdatensicherung ist kein Ersatz für einen gezielten, rücklesbar verifizierten Vor-Reset-Export.
- Steuerlich aufbewahrungspflichtige Buchungen/Abschlüsse müssen im Archiv nach dem Reset für die vorgeschriebene Aufbewahrungszeit lesbar und unverändert bleiben.
- Das V2-Hosting `https://nabster77.github.io/holz-bar-kassen-appv2/`, Branch `main` und jede V2-Datenbank bleiben tabu. V2-Datenbankzuordnung zuerst klären.

## Stornos: neuer Wortlaut gegen bisherige Programmregel
Der Nutzer schrieb jetzt **„nur die ersten 5 Buchungen“**. Im bisherigen Code steht **„die letzten fünf (zeitlich neuesten) Einzelbelege“** der offenen Kassensitzung. Diese Varianten sind nicht dasselbe. Bis geklärt ist, ob tatsächlich die *ersten* fünf chronologisch nach Kassenöffnung oder die *letzten* fünf gemeint sind, keine stillschweigende Änderung der zeitlichen Auswahl. In beiden Varianten dürfen nur höchstens fünf Belege gleichzeitig zur Stornierung angeboten werden und ein bereits stornierter Beleg darf nicht nochmals storniert werden.
