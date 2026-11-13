# WOODMO Kassen-App 3.0 – Umsetzungsfortschritt bis zum Buero-Test

Stand: 13.11.2026. **Nur Entwicklungsbranch `woodmo-v3.0`, keine V2-Veroeffentlichung, keine SQL-Migration und kein Datenbank-Reset.**

## Technischer Ausgangspunkt

- Repository: `Nabster77/holz-bar-kassen-appv2`; bisher veroeffentlichtes V2 liegt auf `main`, **nicht angefasst**.
- Separate V3-Testdatenbank: `tulndunkpsynkbbebenf`; altes Projekt `fsztsmnxbffanyfbytnr` **nicht angefasst**.
- V3-Grunddaten: 53 Produktbilder mit V3-Speicherreferenzen, Kategorie-/Personalgrunddaten gemaess Transferprotokoll vorhanden; keine V2-Verkaufsbons uebernommen.
- Letzter Buero-Praxistest: Startbildschirm mit Kasse/Verwaltung, Cloud verbunden sichtbar; Produktivfreigabe **nicht erteilt**.

## Umgesetzt in der aktuellen Entwicklung

1. **Node.js 26**: Bei Windows wurde der Pfad `new URL(...).pathname` durch `fileURLToPath(...)` ersetzt. Der Grundfehler war `C:\C:\...`, nicht der Benutzername oder Node 26 an sich. QA-Gate testet jetzt Node 26; Matrix Ubuntu/Windows Node 22/26, keine Deployments; `.nvmrc` 26, Engines Node 22/26. Die bestehende Node-26-Installation im Buero kann bleiben.
2. **Startbildschirm**: Oben nur „WOODMO“ und „Kassen-App · Version 3.0“; grosse Logografik entfernt. Zwei Kacheln unveraendert angeordnet. Vordergrund Kasse = Kassensymbol, Verwaltung = Einstellungssymbol. Dezentes, eigenes **schriftfreies** Kassensymbol als Wasserzeichen in beiden Kachel-Hintergruenden. Cloudanzeige bleibt unten.
3. **Tablet-Oberflaeche** (vorheriger Stand): Warenkorb rechts, etwa 65/35 im Hochformat; separate Scrollbereiche, sichtbare Warengruppen mit Namen/Icons; bestehende Kassenaktionstasten via Kassenmenue; Home laesst Warenkorb/Sitzung bestehen.
4. **Pfandwerte**: Parsen in exakten Eurocent; negative, nichtnumerische oder mehr als zweistellige Nachkommabetraege werden mit Fehlermeldung abgewiesen. Kein Speichern bei `onBlur`; Button und Enter speichern bewusst. Status wird unterschieden: ungespeichert, lokal uebernommen/Cloud ausstehend, **Cloud gespeichert und rueckgelesen**, nur lokal im Testmodus, Fehler. Nach dem Schreibweg ueber den bestehenden Katalog-Sync wird der Wert aus `pos_catalog_items` **neu gelesen** und mit beiden Standortwerten verglichen. Ohne passenden Readback keine Erfolgsmeldung.
5. **Pfandberechnungsweg**: Die vorhandene `useStore.getProductPfand`-Funktion nutzt den aktuellen Standortwert bei markierten Pfandartikeln; keine Aenderung historischer Buchungen. Regressionstests fuer Eingabewerte, falsche Cloudzustands-Meldung, Standortvergleich und Statusanzeige hinzugefuegt.
6. **Bisherige Systeme**: Steuerlogik, Kassenbestand, Tagesabschluss, Excel-Transfer, Backup-/Archivfunktionen, Mitarbeiterrechte und SQL nicht veraendert. Automatische Tests pruefen bestehende Regeln.

## Zuletzt nur lesend festgestellte V3-Cloudwerte

`public.pos_catalog_items`, Schluessel `setting/pfand`: Friedrichshafen **3,00 EUR**, Bregenz **3,00 EUR**. Der frueher im Buero eingegebene Wert 2,00 EUR war **nicht** als Cloud-Wert nachweisbar. **Keine automatische Aenderung auf 2 EUR**.

## Abnahme – naechster Benutzer-Test am Buero-PC

1. V3-Testkopie im bestehenden Ordner `C:\Users\Public\Documents\WOODMO_V3_ARCHIVTEST_20261112` aktualisieren; lokale `.env.local` dabei nicht ueberschreiben.
2. Mit Node.js 26 `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run lint` ausfuehren; danach `npm run dev -- --host 127.0.0.1 --strictPort`.
3. Browser mit `http://127.0.0.1:5173/` aufrufen und mit Strg+F5 laden. Startseite: kein Logo oben, zwei Kacheln mit dezenten Wasserzeichen, Cloudstatus.
4. Verwalter-Anmeldung und Artikel-/Pfandverwaltung pruefen. Beim erstmaligen Test die vorhandenen 3-EUR-Werte notieren; das Speichern von 2 EUR ist eine **bewusste Aenderung**. Bei `TESTMODUS` darf **nicht** „Cloud gespeichert“ erscheinen. Im aktiven Modus nur die **Pfand-Einstellung** aendern, **keine echten Buchungen**.
5. Wert eingeben, mit Enter oder Button speichern. Erst nach „Cloud gespeichert und ueberprueft“ ist die Cloud-Rueckmeldung nachgewiesen. Dann Strg+F5, Werte erneut oeffnen; zweites Geraet spaeter pruefen.
6. Zur Pfandpreispruefung im POS in den **Testmodus** wechseln; Artikelpreis, Pfand, Rueckgabe und Standort beider Regionen pruefen, keine dauerhaften Live-Bons erzeugen.

## Weiterhin offen (NICHT als fertig melden)

- Browser- und Android-Tablet-Praxistest im Hoch-/Querformat; HTTPS/PWA auf eigener V3-Adresse.
- Node-26-Sicherheits-Audit und Abhaengigkeitswarnungen im npm-Lockfile bewerten, **kein blindes `npm audit fix --force`**.
- Automatischer Backup-1-/Backup-2-Scheduler, vertrauenswuerdige globale Mitarbeitersitzungen, vollstaendige echte Restore-Abnahme.
- Sichere, atomare Storno-Cloud-RPC samt echter POS-UI/Beleg- und Berichts-Integration, wie in den Storno-Architekturdokumenten beschrieben.
- Vollstaendige Enter- und Tastaturpruefung aller Dialoge, Excel-Endabnahme, lokale Berichte, Rechte- und Kassenabschluss-Praxistests.
- **Keine** V3-Veroeffentlichung, kein Merge in `main`, keine produktiven Buchungen bis zur spaeteren ausdruecklichen Freigabe.

## Rueckfallplan

Alle Aenderungen befinden sich ausschliesslich auf `woodmo-v3.0` nach dem Referenzcommit `d993fed213d8d893b6ae5b95a9a654af07d17c3d`. Bei Bedarf einzelne Aenderungscommits im V3-Branch rueckgaengig machen; niemals automatisch lokale `.env.local`, V2 oder Supabase zuruecksetzen.
