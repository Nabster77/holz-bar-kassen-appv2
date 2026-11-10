# WOODMO V2: Excel-Import und Export

Implementiert ausschließlich auf `woodmo-entwicklung`. Der GitHub-Pages-Workflow veröffentlicht nur `main`; an diesem Workflow wurde nichts geändert. Es wurden keine Supabase-Projekte verbunden und keine produktiven Daten oder Storage-Dateien verändert.

## Lokal starten

Node.js 22 oder neuer verwenden. In einem eigenen Test-Browserprofil:

```bash
git switch woodmo-entwicklung
git pull --ff-only origin woodmo-entwicklung
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Ohne `.env` ist Supabase deaktiviert. Verwaltung mit dem bestehenden Verwalter-Passwort öffnen (bei frischem Browserprofil `kasse`), in den Testmodus wechseln und **Excel-Import / Export** öffnen. Excel und optional ZIP auswählen, dann **Vorschau erstellen**. Testmodus erlaubt Vorschau und Export, sperrt die verbindliche Übernahme und sämtliche neuen Bild-Uploads.

Die bereits bestehende App speichert Kataloge im Testmodus weiterhin im Browser. Deshalb ein separates Browserprofil verwenden. Der neue Import selbst ändert im Testmodus keine Katalogdaten.

## Vollständigen Import ausschließlich mit isolierter Test-Cloud testen

1. Ein eigenes Supabase-Testprojekt mit einem reinen Testkonto `admin@kasse.local` verwenden. Ausschließlich dessen URL und öffentlichen Anon-Key in `.env.local` eintragen:

   ```dotenv
   VITE_SUPABASE_URL=https://DEIN-TESTPROJEKT.supabase.co
   VITE_SUPABASE_ANON_KEY=DEIN-OEFFENTLICHER-TEST-ANON-KEY
   ```

   Niemals einen Service-Role-Key im Browser konfigurieren. `.env.local` nicht committen.
2. Die bestehenden Migrationen und anschließend `supabase/migrations/20261110120000_catalog_import.sql` im Testprojekt prüfen und ausführen. Die neue Datei wurde nur vorbereitet. Die vorhandenen RLS-Regeln und diese neue Funktion erwarten dieselbe Admin-UUID `8461bbe1-9c6f-46c4-be41-dcbcc69f8be4`. Bei einem neu angelegten Testkonto muss die Zugriffskonfiguration in einer lokalen Testkopie konsistent zur tatsächlichen UUID angepasst werden. Die Funktion darf nicht durch Entfernen der Rechteprüfung freigeschaltet werden.
3. Dev-Server nach Änderung der Umgebungsvariablen neu starten, am Testkonto anmelden, **aktiven Modus** verwenden und bestehende Synchronisierungskonflikte zuerst auflösen. „Aktiver Modus“ schreibt immer in das konfigurierte Projekt; der Name allein unterscheidet keine Test- und Produktionsdatenbank.
4. Eine vollständige JSON-Sicherung erzeugen. Anfangsbestand und einige Testverkäufe erfassen und deren IDs und Beträge notieren.
5. In der Verwaltung **Excel-Import / Export** öffnen. Preisliste und Bilder-ZIP auswählen. Alle neuen/geänderten/unveränderten Artikel, SCHUSS-Sorten, Warengruppen und globalen Pfandänderungen prüfen. Details zeigen alte und neue Feldwerte. Bildhinweise aufklappen.
6. Ohne Bestätigung darf keine Übernahme möglich sein. Abbrechen muss den Katalog unverändert lassen. Erst Bestätigungsfeld aktivieren und **Jetzt verbindlich importieren** ausführen.
7. Auf einem zweiten Testgerät synchronisieren und Preise an beiden Standorten, SCHUSS-Verwaltung, Pfand sowie Bilder kontrollieren. Transaktionen und Kassensitzungen müssen dieselben IDs und Beträge behalten.
8. Vorschau öffnen, dann auf einem zweiten Gerät einen Katalogeintrag ändern und synchronisieren. Eine Übernahme der alten Vorschau muss mit Konflikt abbrechen. Neue Vorschau erstellen. Lokale Änderungen seit der Vorschau sperren den Import ebenfalls.
9. Bilderersatz zunächst deaktiviert lassen: bestehende Bildzuordnungen müssen erhalten bleiben. Dann mit ausdrücklich aktiviertem Bilderersatz testen: neue Storage-Objekte werden angelegt, alte Dateien bleiben bestehen. Bei Uploadfehlern wird der Katalog nicht übernommen. Vor dem Fehler hochgeladene neue Objekte können unreferenziert verbleiben; sie werden nicht automatisch gelöscht, weil der Importstatus bei Netzfehlern unklar sein kann.
10. Katalog exportieren und unverändert erneut als Vorschau einlesen: keine fachlichen Änderungen. Vollständiges JSON-Backup erzeugen und wiederherstellen. SCHUSS-Grundpreise und Standortpreise sowie explizite Artikelsteuern müssen enthalten sein; neuere Cloud-Einstellungen dürfen nicht von älteren Sicherungen ersetzt werden.

Ein echter Supabase-Upload und die geräteübergreifende Bedienung wurden hier nicht ausgeführt. Der Browserzugriff auf den lokalen Dev-Server war in der Ausführungsumgebung gesperrt. Die SQL-Funktion wurde stattdessen in einer isolierten eingebetteten PostgreSQL-Instanz mit den bestehenden Katalogtabellen, Triggern und RLS-Regeln ausgeführt.

## Unterstützte Excel-Formate

Die bereitgestellte Preisliste wird direkt erkannt: Kopfzeile **Produktname App**, **VK 2026**, **Warengruppe**, **Preis durch Mitarbeiter oder fix**, **Steuer DE in %**, **Steuer AT in %**. Die darüberstehenden Zeilen Friedrichshafen/Bregenz setzen die globalen Pfandwerte. Leere Zeilen werden ignoriert. Numerische Excel-Zellen und Dezimaltexte wie `4,50` sind zulässig. Formeln müssen vorab als Werte gespeichert werden; sie werden nicht ausgeführt oder anhand eventuell veralteter Formel-Caches übernommen.

Der Export enthält vier Blätter:

| Blatt | Inhalt |
| --- | --- |
| Artikel | IDs, Namen, Warengruppe, Grund-/Standortpreise, Preisart, DE-/AT-Steuersätze, Steuerklasse, Pfandmerkmale/-werte, SCHUSS-Freigabe und individuelle Zuschlagspreise, Verfügbarkeit, Sortierung, Bild-URL |
| Warengruppen | IDs, Namen, Icons, Farben, Sortierung, auch leere Gruppen |
| SCHUSS | Geschützte Sorten-IDs, Namen, Grundpreis und optionale Standortpreise; leere Standortpreise verwenden den Grundpreis |
| Einstellungen | Globaler Pfand pro Standort |

Artikel werden mit ID abgeglichen, ansonsten über den vereinheitlichten Namen innerhalb ihrer Warengruppe. Bestehende IDs bleiben stabil. Doppelte oder unbekannte IDs und mehrdeutige Namen werden als Konflikte behandelt. Für neue Einträge die ID leer lassen. Fehlende Einträge werden niemals gelöscht. SCHUSS-Namen aus der Vorlage wie „Rum (Schuss)“ werden bestehenden zentralen Sorten zugeordnet und erzeugen keine normalen Artikel.

Preisarten: `fix` oder `individuell eintragen`. Ein leerer Preis ist nur beim individuellen Preis zulässig und wird bei neuen Artikeln zu 0. Separate Spalten `VK DE` und `VK AT` überschreiben `VK 2026`. Preise werden mit maximal zwei Nachkommastellen von 0 bis 99.999 akzeptiert.

Unterstützte explizite Steuersätze: DE 0/7/19 und AT 0/10/13/20. Diese Werte werden in Warenkorb, Artikelanzeige und Checkout tatsächlich verwendet und als bereits berechnete Beträge in neuen Transaktionen eingefroren. Alte Transaktionen werden nicht neu berechnet. SCHUSS bleibt nach bestehender Kassenlogik Teil des versteuerten Basisartikels; die SCHUSS-Zeilen erwarten 19/20.

Die ursprüngliche Vorlage enthält keine artikelweisen Pfand- oder SCHUSS-Freigabespalten. Bei bestehenden Artikeln bleiben diese Merkmale erhalten. Neue Artikel haben zunächst keinen Pfand und keine SCHUSS-Freigabe. Für pfandpflichtige bzw. kombinierbare Artikel diese Merkmale im Export ergänzen und erneut mit Vorschau einlesen oder über die bestehende Artikelverwaltung setzen. Globale Pfandartikel übernehmen die Standort-Pfandeinstellung; andere Artikel können eigene Pfandbeträge haben.

## ZIP-Bilder

Alle Unterordner werden berücksichtigt. JPEG, PNG, BMP und WebP sind erlaubt. Der Abgleich vereinheitlicht Groß-/Kleinschreibung, Leer-/Sonderzeichen, Umlaute und abschließende Kopienummern wie `(2)`. Es gibt keine unsichere unscharfe Zuordnung. Abweichende Schreibweisen wie „Aromaboxen“ gegenüber „Aromabox“ bitte in der ZIP korrigieren. Mehrere passende Bilddateien blockieren die Vorschau bis zur Bereinigung. Fehlende Bilder blockieren den Import nicht.

Grenzen: Excel 10 MB komprimiert/80 MB entpackt, 10.000 Zeilen und 80 Spalten pro Blatt; ZIP 100 MB komprimiert, 200 MB entpackte Bilder, 10 MB pro Bild, 1.000 ZIP-Einträge. Der Supabase-Bucket kann niedrigere Uploadgrenzen setzen. Bild-URLs werden in Excel und JSON gesichert; die Bilddateien bleiben im vorhandenen `article-images`-Bucket und werden beim Import nicht gelöscht.

## Verifikation

`npm test` prüft Excel-Roundtrip, optionale Felder, Standortpreise/-steuern einschließlich 13% AT, individuelle Preise, Duplikate, ungültige Werte/Formeln, SCHUSS-Zuordnung, ZIP-Unterordner, fehlende und mehrdeutige Bilder, Schutz bestehender Bilder, Sync-Zustand und SCHUSS-Backup-Wiederherstellung. Außerdem läuft die neue Migration lokal in PostgreSQL: Rollen, veraltete Snapshots, atomarer Rollback, Historisierung und Schutz von Buchungen/Kassensitzungen. Die bisherigen Berichts- und Kassenbestandstests laufen ebenfalls.

Die mitgegebenen Originaldateien lassen sich zusätzlich prüfen, ohne sie ins Repository zu kopieren:

```bash
npm run test:catalog -- "/pfad/PReisliste App 2026.xlsx" "/pfad/Bilder Kasse 2026.zip"
```

Ergebnis mit den bereitgestellten Dateien `(2)`: **51 normale Artikel**, **4 bestehende SCHUSS-Sorten aktualisiert**, **31 eindeutige Bildzuordnungen**, **20 Bildhinweise**, **keine Importkonflikte** auf dem unveränderten Seed-Katalog. Bestehende Seed-Artikel bleiben erhalten.

`npm run typecheck` und `npm run build` erfolgreich. Der Build erzeugt auch den PWA-Service-Worker. Es verbleibt die Vite-Warnung zu großen JavaScript-Chunks; die Dateien liegen innerhalb der PWA-Cachegrenze.
