# WOODMO 3.0 – Kassenmenue, Einmal-Anmeldung und Pfand im Verkauf

**Stand:** 13.11.2026 – nur Entwicklungsbranch `woodmo-v3.0`, keine SQL-/Supabase-Aenderungen, keine Veraenderung von `main`.

## Nutzerentscheidung und Umsetzung

1. **Ein kombinierter Anmeldungsknopf in der Kopfzeile**, unmittelbar links neben `Sync Cloud` und `Cloud AKTIV/TEST`. Bei eingeloggtem Kassierer rote Schaltflaeche `Abmelden`, sonst gruene Schaltflaeche `Anmelden`. Derselbe Button loest den *vorhandenen* geschuetzten Mitarbeiter-Login und den *vorhandenen* Abmeldeprozess aus. Benutzername/Passwort und Anmeldeprotokoll bleiben erhalten.
2. Kein zusaetzlicher `Mitarbeiter anmelden`-Button in der oberen Kassen-Infozeile. Der Bezahlknopf bleibt ohne Mitarbeiter deaktiviert. Eine noch nicht eroeffnete Kasse kann durch `Kasse eröffnen` geoeffnet werden, wenn bereits eine Person angemeldet ist.
3. Beim Wiederanmelden einer offenen Kassensitzung muss der erfolgreiche Login den bestehenden POS anzeigen, **ohne** auf Home zu springen oder eine Kassensitzung neu zu buchen. `onSave` des vorhandenen `CashOpeningDialog` wird bei bestehender Sitzung zur bloßen Wiederaufnahme genutzt. Abbrechen/Zur Startseite ist ein eigener Pfad.
4. **Kassenmenue**: ganz oben mittig die Schaltflaeche `Startseite`. Erste Auswahlzeile: links `Kasse`, Mitte `Journal`, rechts `Verwaltung`. Geschuetzte Bereiche sind nur Administratoren zugreifbar. Weitere Kassenoptionen nach wie vor mit Sitzungs-/Mitarbeiterpruefung: `Einlage`, `Ausgabe`, `Bestandskorrektur`.
5. **Pfand-Retoure** entfernt aus dem Popup-Menue. Stattdessen dauerhaft als Touch-Schaltflaeche im Kassen-Verkaufsbereich neben der Artikelsuche sichtbar. Ohne geoeffnete Sitzung oder eingeloggten Kassierer ist sie deaktiviert. Der bestehende `PfandRetoureDialog` und sein Warenkorb-Buchungspfad werden wiederverwendet.
6. **Tagesabschluss nur im Menue**; kein zweiter Tagesabschlussknopf in der Kassenleiste. Menuedarstellung mit `LockKeyhole` und `Nach Bestätigung unwiderruflich`. Auswahl ruft den vorhandenen Abschlussdialog und die bestehende Cloud-Bestaetigung auf, fuehrt **niemals** direkt eine abschliessende Buchung aus.
7. `Home`, Warenkorb-Erhalt, App-Daten, Kassenbestand, Umsatz/Steuer, Pfandwertekonfiguration, Personalrechte, Cloud-Sync, PDF/Journal, Excel und Backup bleiben unveraendert.

## Fehlerkorrekturen

- Das wiederholte `Mitarbeiter anmelden`-Feld wurde entfernt. Anmeldung ueber den gemeinsamen Headerbutton oeffnet den bestehenden persoenlichen Passwortdialog nur auf Anfrage.
- `CashOpeningDialog`: `Kasse weiterführen` schliesst nach erfolgreicher Anmeldung den Dialog lokal, ohne `onHome` aufzurufen.
- Die Home-Kachel `Kasse` triggert den Oeffnungs-/Anmeldedialog bei fehlender Kassensitzung oder ohne eingeloggten Mitarbeiter; auch nach vorherigem Abbrechen bleibt die Anmeldung erreichbar.
- Direkte Pfand-Retoure nimmt einen bestehenden gesicherten Verkaufspfad; sie ist keine neue Kassenbewegung oder direkter Cloud-Write.

## Kontrollen

- Neuer Regressionstest `scripts/check-v3-cash-menu.mjs`, in `npm test` und CI eingebunden.
- Zusaetzlich gesamte Kassen-/Storno-/Cloud-/Backup-/Pfand-Regression, Typecheck, Build und Lint auf Node.js 22/26, Windows/Linux.
- Echter Test am Buero-PC und danach Tablet im Hoch-/Querformat erforderlich.

## Abnahme durch Benutzer

1. Kasse mit Mitarbeiter offen: linker Cloud-Nachbar `Abmelden` (rot und beschriftet auf grossen Displays).
2. Abmelden ohne Tagesabschluss; danach derselbe Platz zeigt `Anmelden` (gruen). Kein weiterer Login-Knopf oben im Kassenbereich.
3. Beim erneuten Anmelden persoenliches Passwort benutzen und bestehende Kassensitzung weiterfuehren; Warenkorb bleibt erhalten.
4. Menue oeffnen: `Startseite` oben mittig, darunter `Kasse | Journal | Verwaltung` (Administrator), danach `Einlage | Ausgabe | Bestandskorrektur`, `Tagesabschluss` mit Schloss.
5. `Pfand-Retoure` auf Kassenbildschirm neben Artikelsuche antippen; korrekten Betrag und Warenkorb pruefen – nur im Testmodus buchen.
6. Tagesabschluss-Menueeintrag darf nur den geschuetzten Dialog oeffnen; keine ungewollte Abschlussbuchung.
7. Cloudstatus und Theme bleiben rechts, Administratorverwaltung und Journal bleiben geschuetzt.

## Freigabestatus

**Entwicklung + automatisierte Pruefung**, keine V2- oder V3-Veroeffentlichung, keine SQL-/Datenbank-Aenderung. Kassen-Praxistest ausstehend.
