# Sichere Testanleitung – Reset-Reparatur

Diese Kopie ist ausschließlich für ein **neues Supabase-Testprojekt** bestimmt. Sie enthält keinen Zugang zum Originalprojekt. Die Original-ZIP und ihre Datenbank werden nicht verändert.

## Vor dem Start

1. In Supabase ein neues, leeres Projekt anlegen, zum Beispiel `holzbar-reset-test`.
2. Dort ausschließlich einen Testbenutzer `admin@kasse.local` anlegen und dessen UUID notieren.
3. Die Testkopie ist bereits auf die UUID des Testbenutzers eingestellt. Nichts an den Migrationsdateien ändern.
   - `supabase/migrations/20261029170729_restrict_pos_cloud_tables_to_admin_account.sql`
   - `supabase/migrations/20261030093212_create_pos_catalog_sync.sql`
   - `supabase/migrations/20261030133155_add_booking_reset_to_pos_sync.sql`
   - `supabase/migrations/20261101090000_harden_pos_booking_reset_generation.sql`
   - `supabase/migrations/20261105120000_align_pos_test_admin_account.sql`
4. Alle Migrationen in dieses neue Projekt einspielen. Niemals das Originalprojekt verknüpfen oder dessen Projekt-URL verwenden.
5. Die Testkopie enthält bereits eine `.env` mit der URL und dem öffentlichen Publishable-Key des **Testprojekts**. Danach mit einer aktuellen Node.js-Installation `npm ci`, `npm run typecheck` und `npm run build` ausführen. Ausschließlich den frisch erzeugten Ordner `dist` bereitstellen.

## Kontrollierter Testablauf

1. Die Testversion auf zwei Geräten oder zwei getrennten Browser-Profilen öffnen und mit dem Testkonto anmelden.
2. Auf Gerät A eine Kassensitzung und mindestens zwei Verkäufe erfassen; dann synchronisieren.
3. Gerät B offline schalten, dort weitere Buchungen erzeugen und die App schließen, damit die Offline-Warteschlange erhalten bleibt.
4. Auf Gerät A den Reset ausführen und anschließend in Supabase kontrollieren: `pos_transactions` und `pos_cash_sessions` müssen leer sein; `pos_booking_resets` erhält einen neuen Eintrag.
5. Gerät B wieder online schalten und synchronisieren. Die alten Offline-Buchungen dürfen weder in der App noch in den beiden Cloud-Tabellen erscheinen.
6. Auf beiden Geräten eine **neue** Buchung nach dem Reset erfassen und synchronisieren. Sie muss erscheinen und zwischen den Geräten abrufbar sein.

## Was diese Testversion ändert

- Jede Buchung trägt eine serverseitig geprüfte Reset-Generation statt nur eines Tablet-Zeitstempels.
- Warteschlangen aus älteren Generationen werden vor dem Upload verworfen.
- Der Reset-Marker wird vor jedem Upload geprüft.
- Ein Cloud-Abruf, der vor einem Reset gestartet wurde, darf sein altes Ergebnis nicht mehr lokal zurückschreiben.

## Wichtiger Hinweis

Die vorhandene `dist`-Ausgabe in der ursprünglichen Sicherung stammt vom alten Build. Sie darf nicht als Testversion veröffentlicht werden. Der Build muss nach den obigen Schritten neu erzeugt werden.
