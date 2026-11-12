# WOODMO V3 – Startseite, Home-Navigation und Tablet-Layout

Stand: 13.11.2026. Nur Branch `woodmo-v3.0`; keine Änderung an Supabase oder `main`.

- Startseite mit exakt zwei großen Kacheln: Kasse und Verwaltung.
- Verwaltung weiterhin über bestehende Passwort-/Rollenprüfung. Eine aktive Kasse wird durch Home nicht geschlossen.
- POS bleibt nach erster Öffnung gemountet; Wechsel zu Home, Verwaltung und Journal zerstört weder Cart-State noch offene Kassendialoge.
- Hochformat ab 640 CSS-Pixeln: Artikel/Warengruppen links ca. 65 %, Warenkorb rechts ca. 35 %. Auf sehr schmalen Smartphones responsives Untereinander zur Wahrung der Bedienbarkeit.
- Querformat: links mehr Breite, rechts fest sichtbarer Warenkorb mit unabhängigem Scrollbereich.
- Warengruppen mit Icon und Namen in sichtbarem Raster, bei vielen Gruppen eigenständig scrollbar.
- Wiederverwendung der realen Funktionen: Einlage, Ausgabe, Pfandretoure, Anfangsbestandskorrektur, Tagesabschluss, Sync, Abmelden; keine neuen Buchungspfade.
- Originales vom Nutzer gewähltes WOODMO-3.0-Bild auf Startseite und in Kopfzeile.
- Ausstehende echte Tests: Tablet-Hochformat, Bildschirmtastatur, aktive Warenkorbsitzung bei Home-Wechsel und manueller Journal-Druck. Das automatische Backup-Timing bleibt ein separates offenes Thema.
