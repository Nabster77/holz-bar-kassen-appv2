import { useState } from 'react';
import { Download, FolderOpen, ShieldCheck, X } from 'lucide-react';
import { configureJournalExportFolder } from '@/lib/journalPdfFile';
import { readDeviceSetup, saveDeviceSetup } from '@/lib/deviceSetup';

interface Props {
  onComplete: () => void;
  onCancel?: () => void;
}

export function DeviceSetupDialog({ onComplete, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = readDeviceSetup();

  async function chooseFolder() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await configureJournalExportFolder();
      if (result.mode === 'cancelled') return;
      if (result.mode === 'folder') {
        saveDeviceSetup('folder', result.folderName);
        onComplete();
      } else {
        // The filesystem picker is unavailable on this browser (notably Android).
        setError('Dieser Browser bietet keinen dauerhaft freigegebenen Ordner. Verwende Downloads oder den Teilen-Dialog.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ordner konnte nicht ausgewählt werden.');
    } finally {
      setBusy(false);
    }
  }

  function chooseDownloads() {
    saveDeviceSetup('downloads');
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
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          Wo möchtest du Journale und Tagesabschlüsse lokal speichern?
          Wir sortieren die Dokumente nach <strong>Jahr, Standort und Berichtsart</strong>.
          Bereits angelegte Dokumentenordner bleiben auch nach einem Buchungs-Reset bestehen.
        </p>
        {previous?.folderLabel && <p className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">
          Bisheriger Ordner: <strong>{previous.folderLabel}</strong>
        </p>}
        <div className="space-y-2">
          <button type="button" onClick={() => void chooseFolder()} disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
            <FolderOpen size={19} /> {busy ? 'Ordner wird geprüft …' : 'Berichtsordner auswählen'}
          </button>
          <button type="button" onClick={chooseDownloads} disabled={busy}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            <Download size={19} /> Downloads / Teilen verwenden
          </button>
        </div>
        {error && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{error}</p>}
        <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>
          Der Speicherort wird nur in diesem Browser gespeichert. Es werden keine Passwörter oder Kassenbuchungen geändert.
        </p>
      </section>
    </div>
  );
}
