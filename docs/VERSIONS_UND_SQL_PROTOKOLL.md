# WOODMO – Versions- und SQL-Änderungsprotokoll

## Ausgangsstand (11.11.2026)

- Öffentliche App: GitHub Pages, Repository `Nabster77/holz-bar-kassen-appv2`, Zweig `main`.
- GitHub-Ausgangscommit: `10bec80b2c92a333475042ddfaa4c473a26723da` (Merge von PR #12).
- Entwicklung: Zweig `woodmo-entwicklung`; dort ist die zusätzliche Vollbild-Korrektur für `src/components/PasswordGate.tsx` enthalten (Commit `e8b46485d6805ae5ca29a010bef19863cbb7f779`).
- Geplante Änderung: Nur die Fokus-/Positionierungslogik des Verwaltungspasswort-Dialogs auf die aktuelle `main`-Basis übertragen.
- Supabase: **Keine SQL-Änderung für diese geplante UI-Korrektur erforderlich oder vorgesehen.**
- Supabase-Schema-Iststand: **noch nicht unabhängig aus Supabase ausgelesen oder als Snapshot gesichert**. Der aktuelle GitHub-Code beweist keine vollständige Übereinstimmung mit der produktiven Datenbank.
- Produktionsdaten: Keine Buchungen, Mitarbeiterdaten, Passwörter, Bestände oder Datenbankstrukturen im Rahmen dieses Tests ändern.

## Freigabe- und Rücknahmeverfahren

1. Vor Veröffentlichung genaue GitHub-Differenz kontrollieren und sicherstellen, dass keine SQL-/Migrationsdateien geändert wurden.
2. GitHub-Commit und Veröffentlichungszeitpunkt festhalten; Tablet-App im echten installierten Vollbildmodus testen.
3. Bei Problemen **nur die betreffende Codeänderung** durch einen neuen Revert-Commit rückgängig machen; keine Datenbank-Rücksetzung.
4. Für künftige Schemaänderungen vorab Ist-Schema, exakte Vorwärtsmigration, geprüfte Rückwärtsmigration, Abhängigkeiten und Datensicherung dokumentieren. Destruktive SQL-Befehle niemals automatisch ausführen.
5. Ein SQL-Rollback ist keine Garantie für eine 1:1-Wiederherstellung; dafür ist ein überprüfbares Backup nötig.

## Veröffentlichung und Abnahme #13 (11.11.2026)

- Freigabe: Nutzer hat die Veröffentlichung ausdrücklich freigegeben.
- Pull Request: https://github.com/Nabster77/holz-bar-kassen-appv2/pull/13
- Vorheriger öffentlicher Stand: `main@10bec80b2c92a333475042ddfaa4c473a26723da`.
- Veröffentlichter Merge-Commit: `dccc00303763d37a1c87e8ae32a0410ea782cc97`.
- Änderung: ausschließlich `src/components/PasswordGate.tsx` (12 Zeilen hinzugefügt, 1 entfernt); Verschiebung des Verwaltungspasswort-Dialogs bei Fokus auf das Passwortfeld, falls der sichtbare Viewport trotz Bildschirmtastatur nicht schrumpft.
- GitHub Actions: Workflow **GitHub Pages #24**, grüner Erfolgshaken im Screenshot des Nutzers, Zweig `main`.
- Praxistest: Nutzer hat die originale installierte WOODMO-App auf dem Samsung-Tablet im echten Vollbildmodus ohne Chrome-Adressleiste geöffnet. Beim Antippen des Verwaltungspasswort-Felds und Öffnen der Bildschirmtastatur verschob sich das Fenster nach oben und blieb sichtbar. **Vom Nutzer ausdrücklich als erfolgreich bestätigt.**
- Ergebnis: **Bestanden; Veröffentlichung beibehalten. Kein Rollback erforderlich.**
- Supabase/SQL: Keine Schemaänderung und keine SQL-Migration für #13. Kein SQL-Rollback nötig. Keine Testbuchungen oder Datenbankänderungen durch diesen Ablauf veranlasst.
- Aufräumen: Keine neu angelegten Supabase-Testtabellen, Testspalten oder Testdatensätze aus #13 zu bereinigen. Testzweig kann nach Freigabe später entfernt werden; Git-Historie und Protokoll erhalten.
- Hinweis: Das produktive Supabase-Schema wurde weiterhin nicht separat inventarisiert oder als vollständiger Snapshot gesichert.

## Änderungsjournal

| Datum | Bereich | Ausgang | Ziel | SQL | Status |
| --- | --- | --- | --- | --- | --- |
| 11.11.2026 | Verwaltungspasswort-Dialog im Android-App-Vollbild | `main@10bec80b` | `main@dccc003` (PR #13) | keine | Veröffentlicht; GitHub Pages #24 erfolgreich; echter Samsung-PWA-Vollbildtest bestanden |
