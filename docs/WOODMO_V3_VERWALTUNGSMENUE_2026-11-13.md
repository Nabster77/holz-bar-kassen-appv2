# WOODMO V3 – Umsetzungsprompt und Abnahme: Verwaltungsmenü

**Datum:** 13.11.2026. **Freigabe:** Nutzer hat die konkrete Umsetzung im Branch `woodmo-v3.0` autorisiert. **Keine SQL-Migration, keine Cloud-Datenmutation, kein Merge nach `main`, kein Deployment.**

## Verbindlicher interner Umsetzungsauftrag

> Untersuche zuerst `src/App.tsx`, `src/components/Admin/AdminScreen.tsx`, `src/components/WoodmoBrand.tsx` und `src/index.css`. Verschiebe auf der vorhandenen dunkel-navy Kopfzeile die Navigation in die Reihenfolge **WOODMO 3.0 Logo links → Bereichstitel (Kasse / Verwaltung / Journal) → farbiger Home-Button → Menü-Button → flexible freie Fläche → unveränderte Cloud-Synchronisierung und Cloud-Status rechts**. Die Menü-Taste darf nur einen Bereich anzeigen, auf den die Rolle tatsächlich Zugriff hat. Die Administratoransicht startet unverändert mit der Kassen-Übersicht. Entferne die bisher dauerhaft belegende Verwaltungs-Tab-/Aktionsleiste. Die Verwaltung erhält stattdessen ein vertikal scrollbareres, touchfreundliches Menü mit drei logisch gruppierten Bereichen. 
>
> **Verwaltungsbereiche:** Kassen-Übersicht, Warengruppen, Artikel, SCHUSS, Benutzer, Journal. **App-Einstellungen:** Setup / PDF-Ordner und Wechsel zwischen Test- und Aktivmodus. **Import / Export:** Excel-Import / Export, Backup importieren, Backup exportieren, Buchungen zurücksetzen (mit vorhandener Sicherheitsbestätigung). Alle Optionen müssen bestehende Callbacks/Modale weiterverwenden. Bereits editierte SCHUSS-Daten dürfen nicht kommentarlos verworfen werden.
>
> Das Logo zeigt beim erreichbaren/abgeglichenen Zustand einen **deutlichen hellgrünen, sanft pulsierenden Leuchtring**, bei Verbindungsproblem einen **deutlichen statischen roten Leuchtring**. Titel normal weiß, bei Offline-Schaltung rot mit sanftem statischem Leuchten. `prefers-reduced-motion` beachten. Kein roter Puls. Die vorhandenen Cloud-/Sync-Anzeigen bleiben rechts und unterscheiden Weiterhin Cloud-Probleme von Test-/Aktivmodus.
>
> Bewahre die Regeln für Kassenöffnung, Bargeld/Karten, Pfand, Tagesabschluss, Journal, Import/Export, Personalrechte und Backup vollständig. Mache **keine** neuen Buchungsfunktionen und keine ungenehmigten Datenbank- oder Produktionsänderungen. Prüfe TypeScript, ESLint, den Produktions-Build sowie die gesamte Kassen-Regression unter Windows/Linux mit Node 22/26.

## Implementierung (reale Dateien)

- `src/App.tsx`: Reihenfolge/Design Kopfzeile, Home neben Titel, Menü daneben, rechter Cloudbereich erhalten, Administratormenü erst nach `adminUnlocked`; Warnung für offene SCHUSS-Entwürfe vor Home.
- `src/components/Admin/AdminScreen.tsx`: Menü mit den drei genannten Abschnitten; `tab='sessions'` bleibt erste Ansicht, sämtliche vorhandenen Modal- und Kontrollpfade weiterverwendet; Schutz bei ungespeichertem SCHUSS.
- `src/index.css`: starke zweifarbige Status-Glows, grün mit langsamer Animation, rot dauerhaft statisch, Bewegungssperre.
- `scripts/check-v3-admin-menu.mjs` + `npm test`: statische Regression der Reihenfolge, Menüeinträge, Rollensperre, Glow und bisheriger Absicherungen.

## Abnahme

1. Verwaltung über Home-Kachel als Administrator öffnen. Erster Inhalt: **Kassen-Übersicht**.
2. Kopfzeile zeigt links Logo, weißes „Verwaltung“, Home-Schaltfläche, daneben Menü. Cloud-Schalter/-Status sind weiterhin rechts.
3. Menü zeigt alle Verwaltungsbereiche und genau die beiden Gruppierungen **App-Einstellungen** und **Import / Export** mit sämtlichen genannten Aktionen. Die alte obere Reiter-/Aktionsleiste ist entfernt.
4. Über Journal ändert sich der Titel auf „Journal“; Home bleibt daneben. Kasse zeigt „Kasse“.
5. Online: hellgrüner Leuchtring am Logo; Offline: statisch rot und **Verwaltung** rot; bei laufendem Sync darf ein gelber Zwischenzustand erkennbar sein. Nie rotes Pulsieren.
6. Backup importieren, Buchungen zurücksetzen und Testmodus verwenden **nur vorhandene** geschützte Dialoge; nicht ohne Abschluss buchen oder Daten löschen.
7. Nach einem SCHUSS-Entwurf bei Bereichswechsel Nachfrage; keine stumme Verwerfung.
8. Echte UI und Tablet-Praxistests sind zusätzlich erforderlich; bloße CI beweist weder Kamera-/Touchdarstellung noch tatsächlich funktionierendes Büro-WLAN.

## Offene Aufgaben außerhalb dieser Änderung

- Echte Browser-/Tablet-Abnahme einschließlich Hoch-/Querformat und Offline-Schalter.
- Automatische Backup-Scheduler und Storno-Cloud-Integration laut anderen V3-Arbeitsdokumenten bleiben eigenständig offen.
- Erst nach Nutzerabnahme veröffentlichen; ursprüngliche V2 `main` unangetastet.
