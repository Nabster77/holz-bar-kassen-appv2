import { useState } from 'react';
import { Download, FolderOpen, ShieldCheck, X, Laptop, Monitor, TabletSmartphone } from 'lucide-react';
import { configureJournalExportFolder } from '@/lib/journalPdfFile';
import { readDeviceSetup, saveDeviceSetup, type DeviceKind } from '@/lib/deviceSetup';

interface Props {
  onComplete: () => void;
  onCancel?: () => void;
  warning?: string | null;
}

export function DeviceSetupDialog({ onComplete, onCancel, warning }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = readDeviceSetup();
  const [deviceKind, setDeviceKind] = useState<DeviceKind>(() => previous?.deviceKind ?? (/Android|iPad/i.test(navigator.userAgent) ? 'tablet' : 'pc'));
  const hasDirectoryPicker = typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  async function chooseFolder() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await configureJournalExportFolder();
      if (result.mode === 'cancelled') return;
      if (result.mode === 'folder') {
        saveDeviceSetup('folder', result.folderName, deviceKind);
        onComplete();
      } else {
        // The filesystem picker is unavailable on this browser (notably Android).
        setError('Dieser Browser unterstützt keine automatische Ordnerverwaltung. Bitte manuell speichern.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ordner konnte nicht ausgewählt werden.');
    } finally {
      setBusy(false);
    }
  }

  function chooseDownloads() {
    saveDeviceSetup('downloads', undefined, deviceKind);
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="device-setup-title"
        className="relative w-full max-w-lg space-y-4 rounded-3xl border border-emerald-700/40 bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-7">
        {onCancel && <button type="button" aria-label="Setup schließen" onClick={onCancel}
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button>}
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-800/10 p-3 text-emerald-700 dark:text-emerald-400"><FolderOpen size={26} /></div>
          <div>
            <h2 id="device-setup-title" className="text-xl font-bold text-slate-900 dark:text-white">WOODMO 3.0 – Geräte-Setup</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Einmalig für dieses Gerät. Später in der Verwaltung änderbar.</p>
          </div>
        </div>
        {warning && <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">{warning}</p>}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">Welches Gerät verwenden Sie?</legend>
          <div className="grid grid-cols-3 gap-2">
            {([
              { kind: 'tablet' as const, label: 'Tablet', Icon: TabletSmartphone },
              { kind: 'pc' as const, label: 'PC', Icon: Monitor },
              { kind: 'notebook' as const, label: 'Notebook', Icon: Laptop },
            ]).map(({ kind, label, Icon }) => (
              <button type="button" key={kind} aria-pressed={deviceKind === kind} disabled={busy}
                onClick={() => setDeviceKind(kind)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 py-2 text-xs font-semibold transition ${deviceKind === kind ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'}`}>
                <Icon size={22} />{label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">WOODMO prüft anschließend die Möglichkeiten dieses Browsers. Die Geräteauswahl legt keine Bildschirmrotation fest.</p>
        </fieldset>
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
          <p>Wähle den <strong>Speicherort</strong>. Falls der Browser Ordnerverwaltung unterstützt, kann WOODMO Unterordner anlegen.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Beispiel: Kasse 26 / Friedrichshafen / November / Tagesabschluss
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Alternativ kannst du Dateien selbst speichern. Die Auswahl ist später in der Verwaltung änderbar.
          </p>
        </div>
        {previous?.folderLabel && <p className="rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">
          Aktueller Speicherort: <strong>{previous.folderLabel}</strong>
        </p>}
        <div className="space-y-2">
          {hasDirectoryPicker ? (
            <button type="button" onClick={() => void chooseFolder()} disabled={busy}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
              <FolderOpen size={19} /> {busy ? 'Ordner wird geprüft …' : 'Speicherort auswählen – automatisch'}
            </button>
          ) : (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Dieser Browser bietet keine automatische Ordnerwahl. Verwende die Download-Option. WOODMO speichert die Kassenbuchungen davon unabhängig.
            </p>
          )}
          <button type="button" onClick={chooseDownloads} disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            <Download size={19} /> Selbst verwalten (Downloads / Teilen)
          </button>
        </div>
        {error && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{error}</p>}
        <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>PDFs bleiben lokal auf diesem Gerät.</p>
      </section>
    </div>
  );
}
