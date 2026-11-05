import { AlertTriangle, Cloud, Monitor } from 'lucide-react';
import type { ConflictChoice } from '@/lib/catalogEngine';

export function CatalogConflictDialog({ onChoose }: { onChoose: (choice: ConflictChoice) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center">
      <div className="my-auto w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Unterschiedliche Artikel gefunden</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Die Cloud und dieses Gerät haben unterschiedliche Stände</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          Bitte wählen Sie, welcher Stand gelten soll. Ein Backup dieses Geräts wurde vorher gesichert. Keine Daten werden gelöscht.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onChoose('cloud')}
            className="flex items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95"
          >
            <Cloud className="h-5 w-5 shrink-0" />
            <span>
              Cloud übernehmen
              <span className="block text-xs font-normal text-blue-100">Die Artikel aus der Cloud gelten auf diesem Gerät.</span>
            </span>
          </button>
          <button
            onClick={() => onChoose('local')}
            className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-left text-sm font-semibold text-gray-800 transition hover:bg-gray-50 active:scale-95 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            <Monitor className="h-5 w-5 shrink-0" />
            <span>
              Lokal hochladen
              <span className="block text-xs font-normal text-gray-500 dark:text-gray-300">Die Artikel dieses Geräts werden in die Cloud geschrieben. Cloud-Artikel, die hier fehlen, bleiben erhalten.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
