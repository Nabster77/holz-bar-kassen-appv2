# WOODMO 3.0 – Verbindlich: PDF-Dateien nur gerätelokal

Stand: 12.11.2026. Ersetzt alle früheren Forderungen, fertige PDF-Dateien automatisch in Supabase Storage hochzuladen.

## 1. Daten ja – PDF-Dateien nein

- **Supabase:** Alle benötigten echten Ursprungsdaten: Einzelbuchungen, nachvollziehbare Stornos, Kassensitzungen, endgültige Tagesabschlüsse mit ihren vollständigen Originaldaten und Belegnummern, Katalog und Berechtigungen.
- **Nicht in Supabase:** Fertig gerenderte Tagesabschluss-/Journal-/Kassenübersichts-PDFs.
- **Auf PC oder Tablet:** PDF wird jeweils **neu aus den verfügbaren Cloud-Buchungsdaten** erzeugt und ausschließlich lokal auf diesem Gerät abgelegt.
- Ein anderer PC meldet sich mit den nötigen Berechtigungen an, synchronisiert die Cloud-Daten, wählt bei der erstmaligen Einrichtung seinen **eigenen lokalen** Archivordner und kann nach Zeitraum, Standort und Berichtsart auch historische PDF-Berichte neu generieren.
- Auf einem Gerät erzeugte lokale PDF-Dateien werden nicht automatisch auf andere Geräte übertragen. Die Cloud liefert nur die Quelldaten.
- Die Systemfunktion „Als PDF drucken“ bestimmt ihren eigenen Speicherort; die PWA kann den Betriebssystemdialog nicht umgehen.

## 2. Auswahl des Speicherortes und fehlende Ordner

- Der Benutzer wählt im Geräte-Setup nur einen übergeordneten **lokalen** Ordner. Die App legt bei ausreichender Browserberechtigung `Kasse 26 / [Standort] / [Monat] / [Berichtsart]` für 2026; ab 2027 `Kasse 27`, ab 2028 `Kasse 28` usw., jeweils mit `Sicherung/Backup1` und `Sicherung/Backup2` an.
- Vorhandene Ordner werden mit `getDirectoryHandle(name,{create:true})` **wiederverwendet**; sie werden nicht gelöscht, geleert oder dupliziert. Die Grundstruktur für Standorte und Backup 1/2 wird beim nächsten Zugriff im neuen Jahr angelegt; Monat und Berichtsart werden nur bei Bedarf ergänzt. Historische Berichte bleiben stets im ursprünglichen Berichtsjahr und -monat.
- Fehlt die Freigabe, ist der Pfad nicht erreichbar oder ist er nicht beschreibbar, darf das Programm **nicht kommentarlos auf einen anderen Ordner ausweichen**.
- Stattdessen: sichtbarer Warnhinweis im Geräte-Setup, Auswahl korrigieren. Nach der Korrektur kann der Bericht aus Cloud-Daten erneut erzeugt werden.
- Auf Android/Browsern ohne dauerhaften Ordnerzugriff ist der Nutzer explizit auf den lokalen Download-/Teilen-Dialog angewiesen. Automatisches geräteübergreifendes Filesystem-Schreiben ist nicht möglich.

## 3. Gleichnamige PDF-Dateien

- Ein erneut erzeugtes, normales Journal-PDF kann das alte, erneut erzeugbare PDF im ausgewählten lokalen Archivordner aktualisieren.
- **Endgültige Tagesabschluss-PDFs sind historische Belege:** Byte-identische Dateien werden nicht erneut geschrieben; abweichender PDF-Inhalt erzeugt einen ausdrücklich sichtbaren Konflikt und wird nicht überschrieben. Eine getrennt gekennzeichnete Neuausgabe benötigt einen eigenen Dateinamen. Originaldaten in Supabase und ihre Abschlussnummer sind unveränderlich. Bei abweichenden Versionen ist ein ausdrücklicher Konflikthinweis beziehungsweise eine neue, als Neuausgabe gekennzeichnete Kopie erforderlich, nicht eine unkontrollierte Änderung des Originals.
- Die Tatsache, dass eine neue PDF-Datei heute erzeugt wurde, macht ihre Buchungsdaten nicht automatisch „neuer“ als die korrekten Daten der ursprünglichen Abschlussnummer. Ein echter Versionsvergleich der Geschäftsquellen ist nötig.

## 4. Aktuelle Umsetzung und Restrisiken

Im Branch `woodmo-v3.0`:
- `src/lib/journalPdfFile.ts` speichert fertige PDFs nur lokal und fordert bei fehlender Ordnerfreigabe erneut Geräte-Setup an.
- `src/lib/pdfArchiveSetup.ts`, `src/App.tsx` und `DeviceSetupDialog.tsx` zeigen den Warnhinweis und öffnen Geräte-Setup.
- `src/lib/finalizedCashCloud.ts` speichert **nur den Daten-Snapshot** in `pos_cash_sessions` und liest ihn zur Überprüfung zurück. Keine PDF-Binärdaten werden hochgeladen.
- `src/lib/finalCloseVerification.ts` vergleicht den vollständigen Abschluss einschließlich Buchungs- und Geldwerte.

**Noch zu prüfen:** Erstmaliges Setup/Ordnerberechtigungen auf dem realen Android-Tablet, endgültige Tagesabschluss-PDF-Erstellung in verschiedenen Browsern, Konfliktdarstellung gleichnamiger endgültiger Dateien, vollständige Storno-/Datenwiederherstellungs-Konsistenz, Cloud-Abnahme mit echten isolierten Testfällen.

**Berechtigungen:** Cloud-Buchungen sind unabhängig davon, ob der Client lokal einen PDF-Ordner freigeben kann. Ein fehlgeschlagenes PDF darf einen von Supabase bestätigten Tagesabschluss nicht rückgängig machen. Es muss eine deutliche Nachspeicher-Aufforderung auslösen.
