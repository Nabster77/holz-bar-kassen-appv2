import { useEffect, useMemo, useState } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { buildJournalHTML, type JournalReportData } from '@/lib/journalPdf';
import { exportJournalPdf } from '@/lib/journalPdfFile';

export function JournalPreviewDialog({ data, onClose }: { data: JournalReportData; onClose: () => void }) {
  const html = useMemo(() => buildJournalHTML(data), [data]);
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handlePrint() {
    try {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    } catch {
      setError('Der Druckdialog konnte nicht geöffnet werden.');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await exportJournalPdf(data);
    } catch {
      setError('Die PDF-Datei konnte nicht erstellt werden. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/60" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Kassenjournal - Vorschau</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {saving ? 'PDF wird erstellt...' : 'PDF speichern'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              <Printer className="h-3.5 w-3.5" /> Drucken
            </button>
            <button
              onClick={onClose}
              aria-label="Schließen"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
        <div className="flex-1 overflow-hidden">
          <iframe
            ref={setIframe}
            srcDoc={html}
            title="Journal Vorschau"
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
