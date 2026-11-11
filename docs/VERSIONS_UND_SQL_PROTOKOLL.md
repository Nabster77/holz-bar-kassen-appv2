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

## Änderungsjournal

| Datum | Bereich | Ausgang | Ziel | SQL | Status |
| --- | --- | --- | --- | --- | --- |
| 11.11.2026 | Verwaltungspasswort-Dialog im Android-App-Vollbild | `main@10bec80b` | Fokusbedingte Verschiebung aus `woodmo-entwicklung@e8b46485` | keine | Test und Veröffentlichung ausstehend |
