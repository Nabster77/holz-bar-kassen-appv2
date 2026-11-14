# WOODMO V3 – Verbindliche Kassen-, Warenkorb-, Sync- und Excel-Regeln (14.11.2026)

## Wichtig: Claude AI Free (erst nach unserer lokalen Abnahme)
Claude prüft ausschließlich den vorhandenen Quellcode auf Fehler, Sicherheits-/Datenintegritätsrisiken und Lücken. **Keine Neuprogrammierung, keine eigenständige Änderung oder Veröffentlichung.** Übergabe: kompakter kopierbarer Bericht `WOODMO_V3_CLAUDE_PRUEFBERICHT_FUER_CHATGPT`, Datei/Zeile, Schweregrad, Reproduktion, minimaler optionaler Patch, nicht geprüfte Punkte. ChatGPT verifiziert Patches separat.

## Nutzerregel Kassenlebensdauer
Eine Kasse bleibt so lange geöffnet, **bis ihr endgültiger Tagesabschluss erfolgreich gespeichert ist**, unabhängig von Mitternacht, Tagen, Wochen, Monaten, Jahren, Abmeldung, Browser-Neustart, Tablet-Wechsel oder Online/Offline. Friedrichshafen und Bregenz sind separat; pro Standort max. eine offene Kasse in der **aktiven Buchungsgeneration**, beide gleichzeitig möglich. Keine automatische Tages- oder Jahres-Schließung.

## Nutzerregel Warenkorb und Buchung
- Artikel hinzufügen, Menge ändern, entfernen und Pfand-Retoure im Warenkorb: ausschließlich lokaler Entwurf, **keine Verkaufsbuchung**.
- Hintergrundsync von Stammdaten, Sitzungszustand und bereits bestätigten Bons läuft weiter, **auch bei gefülltem/editiertem Warenkorb**.
- Erst mit bestätigter Bar-/Kartenzahlung ist der Bon abgeschlossen, erhält feste IDs/Zahlart/Sitzungs-ID, wird lokal dauerhaft gespeichert und per Outbox zur Cloud übertragen.
- Navigation Home/Verwaltung darf den offenen Warenkorb nicht löschen; bestehender POS bleibt gemountet. Cloud-Abgleich darf niemals einen unbezahlten Warenkorb als Verkauf zählen.
- Wenn lokale Persistenz oder Offline-Outbox scheitert, Verkauf nicht als sicher gebucht darstellen: gesonderter Test nötig (derzeit noch offene Sicherheitsprüfung).
- Offline: Bestätigte Verkäufe lokal zwischenspeichern, bei Wiederverbindung ohne Dubletten hochladen. Storno im aktiven Modus bleibt derzeit online-only, mit bestätigtem Mitarbeiterschutz.

## UI-Entscheidung
- Home → Kasse ist primärer Einstieg und nimmt bestehende Sitzungen wieder auf.
- In Verkaufsansicht kein dominanter grüner „Kasse eröffnen“-Button im Inhaltsbereich.
- Neben `Menü` oben ein kleiner, nur bei geschlossener/nicht vorhandener aktiver Sitzung angezeigter `Kasse eröffnen`-Button. Auf Tablets Icon weiterhin erreichbar. Öffnet denselben Login-/Eröffnungsdialog; keine neue Backend-Kasse bei bloßem Aufrufen des Dialogs.
- Sync Cloud und Online-Status bleiben erreichbar.

## Konkreter Konfliktbefund vor Reset
- Cloud-G0: Friedrichshafen aktive Sitzung mit 200 Euro Anfangsbestand; Bon 19 Euro brutto (13 Euro Waren, 6 Euro Pfand).
- Lokales Notebook: getrennte neu eröffnete Sitzung mit 150 Euro Anfangsbestand, 0 Bons. Journal summierte beide Sitzungen (350 Euro) und den einen Bon; Bonliste und Abschluss der lokalen Sitzung zeigten 0 Verkäufe. Das war eine falsche Sitzungszuordnung, **nicht** ein unbezahlter Warenkorb.
- Ursache: ältere lokale Kasse + Cloud-Kasse zugleich, vorheriger tagesdatumsbezogener Sitzungsfilter und spätes Outbox-Upload; Cloud Unique-Constraint schützt korrekterweise vor zwei gleichzeitig offenen gleichen Standortkassen. Die Korrekturen müssen diese Unterscheidung weiter absichern.

## Neuer neutraler V3-Teststart (Generation 1)
- Im separaten V3-Supabase-Projekt wurde kontrolliert eine neue Buchungsgeneration 1 erzeugt. **Generation 1: 0 Verkäufe, 0 Kassensitzungen, 0 Stornos.**
- Historische G0: 1 Verkauf + 1 offene Kassensitzung **physisch als Historie erhalten**, damit auch alte Daten nicht ungeprüft verschwinden. Sie sind nicht mehr Teil der aktiven Kasse.
- 77 Katalog-Datensätze und 34 Mitarbeiter-Datensätze unverändert, Bildspeicher unangetastet. V2 unangetastet.
- PostgreSQL: pro Standort und Generation höchstens eine aktive Sitzung; stale Generation INSERT/UPDATE abgewiesen. Administrativer Reset erzeugt Generation, löscht keine Belege oder historischen Stornos. `reset_pos_bookings_v2` für Anwendungsrollen gesperrt, `reset_pos_bookings_v3` aktiviert.
- Browser/Notebook muss den neuen V3-Commit laden und **zuerst online synchronisieren**, bevor eine neue Testkasse eröffnet wird. Nie Browserdaten einfach löschen; Offline-Queues der alten Generation müssen verworfen werden. Alte Generation wird von Cloud-Quellen gefiltert.
- Für künftige reale Archiv-/Compliance-Anforderungen: Nachweis, dass alte Belege sicher, zugriffsgeprüft und dauerhaft abrufbar bleiben, separat prüfen.

## Excel-/Bilder-Paket
- Bestehende Excel-Datei bleibt eigenständig exportier-/importierbar; zusätzlich kompletter **ZIP-Paketexport** mit `WOODMO_Katalog.xlsx`, `WOODMO_Bilder.zip`, `LIESMICH.txt`.
- Bilder unter `Bilder/<Produktname>.<reales_Format>` im separaten Bilder-ZIP. Der Dateiname entspricht dem Namen in der Excel-Tabelle (Windows-ungültige Zeichen werden entschärft). Namen/Dateitypen werden geprüft; Fehler beim Abruf oder doppelte/mehrdeutige Bildnamen brechen das Paket sichtbar ab, keine irreführende „vollständige Sicherung“.
- Import weiter mit denselben Regeln: Excel-Vorschau, Konflikte, IDs, Pfand DE/AT, Steuer DE/AT, Preisart, SCHUSS, vorhandene Bilder nur auf ausdrückliche Freigabe ersetzen, ZIP-Unterordner, Umlaute, Bildgrenzen (500 KB, 800 px, ZIP max. 100 MB). Kein automatisches Löschen von Artikeln, die in Excel fehlen. Administrator-Löschungen werden separat über Katalog-Tombstones synchronisiert.
- Bildexport kann bei CORS/Netzwerkproblemen fehlschlagen; kein stilles Weglassen vorhandener Bildreferenzen.

## Verifikationspflicht vor Freigabe
- GitHub CI Typecheck/Tests/Build/Lint auf aktuellem Commit.
- Auf Notebook online Sync nach Reset; 0/0/0 aktive Generation und 1 neues, separat eröffnetes FH-/Bregenz-Kassenpaar.
- Offline bon buchen/Browser neu starten/online: genau eine Buchung, Bestand und Journal konsistent, zweite Geräte übernehmen die Änderungen.
- Gefüllten Warenkorb behalten, während Sync läuft; erst nach Zahlung Kassenumsatz und Bonliste ändern.
- Tagesabschluss nur mit der tatsächlich aktiven Kassensitzung, bereits gebuchte Bons vollständig enthalten.
- Excel-Paket exportieren, separat entpacken, Bilder-ZIP und bearbeitete Excel-Datei über Vorschau rückimportieren; neue/geänderte/gelöschte Produkte über Verwaltung und anderes Tablet synchronisieren.
