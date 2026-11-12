# WOODMO_V3.0 – SQL-Struktur und Sicherungs-Fundstellen (2026-11-12)

## Ergebnis
**Grundsätzlich strukturell kompatibel**, jedoch nur mit der auslesbaren Supabase-Datenbank `Test-Holz-Bar-Kasse` (Projekt `fsztsmnxbffanyfbytnr`). Die andere Datenbank `Holz-Bar-Kasse` konnte wegen Connection-Timeouts nicht vollständig verglichen werden. **Keine Datenmigration und keine Datenbank-Schreibzugriffe.**

## Verifizierte Prüfungen
- 29 notwendige, aus dem 3.0-Modell abgeleitete Spalten samt Typen abgefragt: **29 OK, 0 fehlend, 0 inkompatibel**.
- Tabellen für Buchungen, Kassensitzungen, Warengruppen, Produkte, Einstellungen, Mitarbeiter, Sicherheitsfragen und Tagesabschlussbelege existieren.
- RPC-Funktionen für Katalogimport, Buchungsreset, Mitarbeiterverwaltung, Sicherheits-/Backupmetadaten und Tagesabschluss vorhanden.
- 53 aktive Produkte und 5 Kategorien, 2 Einstellungsdatensätze (`pfand` und `schuss-options`), 3 aktive Mitarbeiter.
- Beide Standorte sind in den Artikelpreisen vorgesehen; alle 53 Artikelbild-Referenzen lassen sich im Storage-Bucket `article-images` auflösen.
- **Kein vollständiger Funktions-/Bildbytes-/V2/V3-Datengleichheitstest.**

## GitHub-Fundstellen
- `supabase/migrations/`: **29** SQL-Migrationen bis `20261110120000_catalog_import.sql`.
- `SUPABASE_TEST_SETUP.sql`: älteres Einrichtungsskript, **nicht vollständig** (u. a. keine `pos_staff_users`, `pos_daily_close_receipts`, `import_pos_catalog`). **Nicht allein für V3 ausführen.**
- `src/lib/seed.ts`: 13 **Demo**-Produkte, 3 Demo-Warengruppen, Pfand-/Preis- und SCHUSS-Vorgaben; **kein echtes Artikel-Backup**.
- `src/lib/backupRecovery.ts`: Export-/Restore-Programmcode; **keine Sicherungsdatei**.
- In den geprüften GitHub-Branches `main`, `woodmo-entwicklung`, `woodmo-v3.0` keine archivierte Datenbank-/Produkt-/Preis-Sicherungsdatei (`.zip/.csv/.xlsx` etc.) gefunden.

## Vor einer V3-Übernahme zu beheben
1. V3 braucht eine **eigene Datenbank**, sonst werden Buchungen der 2.0 mit denen der 3.0 vermischt.
2. Bei neuer Supabase-Instanz feste **Auth-UIDs in RLS/Funktionen** nicht ungeprüft kopieren.
3. In der vorhandenen Testdatenbank gab `list_migrations` keine registrierten Migrationen zurück – tatsächlichen Istzustand statt blindem Einspielen prüfen.
4. Älteres lokales V3-Gesamt-ZIP lässt in `backupRecovery.ts` noch SCHUSS-Backup-Support vermissen, der in GitHub bereits vorhanden ist; vor Installation zusammenführen.
5. Buchungs- und Kassensitzungstabellen **nur strukturell** anlegen; keine bisherigen Verkäufe, Sitzungen, Tagesabschlüsse übertragen.
6. Nach Datenübernahme Stammdaten, Preise, Pfand, Einstellungen, Mitarbeiter und Bildbytes 1:1 prüfen.

**Protokoll: nur lesende Prüfungen. Keine Änderungen an V2 oder Supabase.**

## Nachprüfung 2026-11-12 – Letzter verfügbarer vollständiger Katalogstand

**Bestes verifiziertes Datenfundament:** Supabase-Projekt `Test-Holz-Bar-Kasse` (Ref `fsztsmnxbffanyfbytnr`), ausschließlich lesend geprüft. Es ist **kein gesichertes Exportarchiv**, sondern ein aktiver Datenbestand und kann sich bei weiterer V2-Nutzung ändern.

- Aktiver Katalog: **53 Produkte, 5 Kategorien**, Settings `pfand` und `schuss-options`.
- **53/53** aktive Produkte: `prices.Bregenz` und `prices.Friedrichshafen` sind JSON-Zahlen.
- **53/53** aktive Artikelbilder: Referenz führt auf vorhandenes Objekt im Storage-Bucket `article-images`. Bucket insgesamt **196 Objekte**. Bilddatei-Inhalte wurden noch nicht heruntergeladen oder Byte-für-Byte verglichen.
- **3 aktive Mitarbeiter** (historisch gelöschte Benutzer nicht als aktiv zählen).
- Letzte gespeicherte Katalogrevision nach `updated_at`: Produkte **2026-11-10 15:00:01 UTC**, Kategorien **2026-11-10 14:04:57 UTC**, Einstellungen **2026-11-10 18:58:05 UTC**. Jüngstes Storage-Objekt-Update **2026-11-10 13:01:36 UTC**.
- GitHub-Branches `main`, `woodmo-entwicklung`, `woodmo-v3.0` sowie hochgeladene Chat-ZIP-Dateien auf echte Datenexporte überprüft: enthalten **Programmcode, Seed-/Demoartikel und SQL-Migrationen**, aber **keine vollständige 53-Artikel-Sicherungsdatei**.
- Über `storage.buckets` ist nur der Bucket `article-images` vorhanden; dort keine gesonderte Backup-Sammlung nachgewiesen.
- Die ursprünglich vermutete V2-Datenbank `Holz-Bar-Kasse` ist weiterhin nicht mit SQL auslesbar; dadurch bleibt offen, ob der oben genannte Stand der *absolut letzte* V2-Stand ist.

**Empfehlung:** Diesen 53-Artikel-Stand als derzeit beste prüfbare Vorlage verwenden, zunächst einen unveränderlichen Snapshot nur der Stammdaten und Bilder ziehen (keine Buchungen, keine Admin-Passwörter im Export), anschließend 1:1-Hashvergleich mit getrenntem V3-Ziel. Keine automatische Übertragung in eine von V2 verwendete Datenbank.
