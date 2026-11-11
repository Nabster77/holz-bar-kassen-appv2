# WOODMO – verbindliches Navigations- und Layoutkonzept (11.11.2026)

## Ziel
Nur Layout und Navigation umstellen. Kassenlogik, Berechtigungen, Umsätze, Journale, Cloud-Synchronisation und Supabase unverändert lassen. Öffentliche Version #13 bleibt bis zur ausdrücklichen Freigabe unberührt. Die vorherige Hamburger-Menü-Entwicklung ist durch dieses Konzept abgelöst.

## Startansicht
- Beim App-Start Startbildschirm mit zwei großen, touchfreundlichen Kacheln **Kasse** und **Verwaltung**.
- Kasse öffnet den bestehenden Kassenbereich mit bestehender Mitarbeiteranmeldung/Kasseneröffnung, falls notwendig. Eine aktive Sitzung nicht erneut eröffnen.
- Verwaltung öffnet die vorhandene geschützte Administrator-Anmeldung, unabhängig von einer Kassensitzung. Kein zusätzlicher Verwaltungs-Button mehr in der Mitarbeiteranmeldung.
- Keine Verwaltung für Mitarbeiter; vorhandene Rollen- und Passwortprüfungen nicht abschwächen.

## Kassenbereich
- Maximale Fläche für Artikel, Warenkorb, Schuss und Bezahlung; bestehende Funktionalität erhalten.
- Kleine, gut sichtbare Home-Taste führt zur Startseite **ohne** Kasse zu schließen, Mitarbeiter abzumelden oder Warenkorb zu löschen.
- Kleines **Kassenmenü** öffnet ein Icon-Dialogfenster für bestehende Funktionen: Einlage, Ausgabe, Pfand-Retoure, Anfangsbestandskorrektur, Tagesabschluss und weitere bereits vorhandene Mitarbeiteraktionen. Bestehende Berechtigungen, Sicherheitsbestätigungen und Prüfungen bleiben bestehen. Keine neuen direkten Mutationspfade.
- Rotes Power-Symbol **Abmelden**, im Hochformat kompakt und im Querformat mit kurzer Beschriftung. Abmelden nicht mit Tagesabschluss verwechseln. Bestehende Abmelde-Sicherheitslogik beibehalten.
- Synchronisierung als kompakter Status-/Aktionsbutton mit Cloud-Icon und Refresh-Icon, beschriftet z. B. „Sync Cloud“; Cloud online grün, offline rot, Fehler und ausstehende Speicherung separat klar erkennbar. Kein irreführendes Grün allein wegen Netzwerkverbindung.

## Verwaltungsbereich
- Administrator-Anmeldung, dann bestehende Verwaltung mit Artikel, Warengruppen, Preise, Journale, Import/Export und weiteren vorhandenen Funktionen. Die tatsächliche Berechtigung wird von bestehender Logik erzwungen, nicht allein durch die Anzeige von Menüpunkten.
- Home-Button zur Startansicht; Rückkehr soll keine Daten oder angefangenen Kassenaktionen verwerfen.
- Journale können als Unterbereich der Verwaltung angeboten werden, ohne bestehende Journal-Logik zu ändern.

## Darstellung
- Touchfreundliche Icons und Dialoge; Hochformat kompakt, Querformat mit optionaler Kurzbeschriftung.
- Kein globales, mehrzeiliges Navigationsband über dem Warenkorb.
- Modale Fenster müssen bei Android-Bildschirmtastatur erreichbar bleiben; Scrollen nur wo technisch nötig.
- Tastatur, Bildschirmrotation, Anmeldung, aktiver Verkauf, Administrator, Rückkehr und Offline-Zustand separat prüfen.

## Sicherheit und Veröffentlichung
- Nur auf `woodmo-entwicklung` entwickeln und lokal testen; keine echten Verkäufe oder Testbuchungen in Produktions-Supabase.
- Vor Freigabe Dateidiff, Build, Rechte, aktive Kasse, Warenkorb-Erhalt und Navigation prüfen.
- Für dieses reine Layout-/Navigationsvorhaben **keine SQL-Änderungen geplant**. Sollten unerwartet Schemaänderungen nötig sein, vorher stoppen und einzeln dokumentieren, nicht ausführen.
- Jede Umsetzung und Rücknahme im `docs/VERSIONS_UND_SQL_PROTOKOLL.md` dokumentieren.

## Umsetzungsreihenfolge
1. Vorhandene Komponenten und Sitzungs-/Berechtigungszustände erfassen.
2. Startseite und Home-Navigation ohne Verlust von Kassenstatus und Warenkorb.
3. Kassenmenü als Einstieg in bestehende Aktionen; Sync-/Logout-Anzeige.
4. Verwaltungszugang und Journale anpassen; Mitarbeiteranmeldung vereinfachen.
5. Lokale Tablet-Tests in Hoch-/Querformat, danach ausdrücklich freigegebene Veröffentlichung.
