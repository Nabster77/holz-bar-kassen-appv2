# WOODMO V3 – Heim-PC-Test und konsolidierter Reststand (13.11.2026)

**Entwicklungsbranch:** `woodmo-v3.0` – **V2 main unverändert.** **V3-Cloud:** `tulndunkpsynkbbebenf`, eigene Organisation/Projekt, nicht V2. Kein Deployment nach `main`.

## 1. Implementierte Funktionen für den Test

- WOODMO 3.0 Startseite und Administrationsmenü, Home, dynamischer Bereichstitel, deutliche grüne/rote Online-Anzeige, touchoptimiertes Hoch-/Querformat.
- Gemeinsamer Mitarbeiter-Anmelden-/Abmelden-Knopf, vorhandene Kassensitzung und Warenkorb beim Home-Wechsel erhalten.
- Pfand-Retoure im Verkaufsbildschirm; Pfandwerte beider Standorte mit Enter, Wertevalidierung und Cloud-Rücklesen.
- Bonliste der letzten fünf Originalbons der offenen Kasse; Originalbeleg unveränderlich; Storno mit Grund, persönlichem Passwort, zweiter Freigabe, separatem PDF und Nachweis im Journal.
- Stornoauswirkung auf historischen Brutto-/Netto-Umsatz, MwSt, Pfand, Bar-/Kartenumsatz und Tagesabschluss; Storno-Snapshot wird vor dem finalen Abschluss mit Cloudzustand abgeglichen.
- Manuelle vollständige JSON-Sicherung erweitert um Cloud-Stornobelege; Restore verweigert fehlende/veränderte Stornonachweise.
- V3-Storno-SQL angewendet: `pos_stornos`, RLS, 5 Schutztrigger, keine direkte Browser-Schreibberechtigung. Isolierte SQL-/Race-/Finanz-Regressionen unter Node 22 und 26 auf Windows/Linux bestanden.
- **NEU:** Bereitschaftsprobe `{action:'health'}` am Edge-Dienst. Live-Storno nur nach bestätigtem Edge-Dienst UND lesbarem Journal. Normale Abschlussfunktion benötigt nur ein bestätigtes, vollständiges Stornojournal und bleibt auch bei fehlendem Edge schutzgeprüft nutzbar.

## 2. Offene Punkte, nicht als fertig darstellen

1. **Storno Edge `woodmo-v3-storno` noch nicht deployt.** Automatischer Deploymentversuch wurde durch eine Tool-Sicherheitsprüfung blockiert. Nicht umgehen, Schreiboperationen direkt vom Browser bleiben verboten. Echte Live-Stornos nicht freigeben. Testmodus-Simulation ohne Cloudbuchung ist erlaubt.
2. **Automatisches Backup 1/2:** Integritäts-/Delta-/Ordner-/Regelbausteine vorhanden; echter Scheduler, globale Mitarbeiterpräsenz, Android-Dateirechte und vollständiger Restore-Endtest noch offen. Manuelles vollständiges Backup ist nicht dasselbe wie kontinuierliche Sicherung.
3. Echtgeräte- und Multitablet-Test, echte Karten-Rückerstattung am Terminal, Journal/DE-/AT-Berichtsabnahme, Excel-/ZIP-Bilder Endtest, vollständige Enter-Abnahme aller Dialoge.
4. Kundenverwaltung ist als späterer Wunsch noch nicht implementiert; separate V3-URL/Hosting/PWA-Praxistest vor Veröffentlichung nicht abgeschlossen.
5. Keine automatische Löschung von Storno-Originalen: Sobald ein Storno in der V3-Testdatenbank liegt, ist der pauschale Buchungsreset aus Dokumentationsschutz gesperrt. Archiv-/Resetszenario gesondert entwickeln.

## 3. Lokaler Heim-PC-Test ohne Eingriff in das Büro

- Separater Arbeitsordner: `%USERPROFILE%\WOODMO\WOODMO_V3_HEIM_TEST`.
- GitHub `git clone --branch woodmo-v3.0 --single-branch https://github.com/Nabster77/holz-bar-kassen-appv2.git` nur in diesen neuen Ordner; danach Updates ausschließlich per `git fetch` und `git merge --ff-only`, nie `git reset --hard`.
- Node 26 LTS bevorzugt, 22 unterstützt. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run lint` – keine SQL-/Datenbank-/Deploymentbefehle.
- Lokaler Testserver **`http://127.0.0.1:5183/`**: Port 5183 ist bewusst anders als historische V2/V3-Testruns auf 5173, damit Browserdatenspeicher nicht vermischt wird.
- `.env.local` nur aus sicher verifizierter vorhandener V3-Konfiguration mit URL `https://tulndunkpsynkbbebenf.supabase.co`. Niemals V2-Konfiguration oder Secrets in Text/Protokolle kopieren.
- Bis Live-Storno-Service bereit ist: Testbuchungen/Stornos ausschließlich im App-**TESTMODUS**. Keine echten Buchungs-Resets.
- Ein separates Downloadpaket im Chat enthält den Heim-PC-Doppelklick-Starter `WOODMO_V3_HEIM_STARTEN.cmd`, die V3-Konfigprüfung, eine optionale Tablet-LAN-Startdatei und den ausführlichen Testplan.

## 4. Freigabe

Automatisierte CI-Builds und Regressionen zeigen Quellcodequalität, **nicht** vollständige echte Cloud-/Kartenterminal-/Tablet-Abnahme oder steuerrechtliche Zulassung. Veröffentlichtes V2-Produktionssystem und V2-Supabase bleiben unverändert. 
