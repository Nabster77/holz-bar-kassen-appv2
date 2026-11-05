import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

const DISPLAY_SECONDS = 10;

interface Props {
  onClose: () => void;
}

export function SyncToast({ onClose }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(DISPLAY_SECONDS);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) onClose();
  }, [secondsLeft, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 top-20 z-40 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-green-200 bg-white shadow-xl transition-all duration-300 dark:border-green-800 dark:bg-gray-800 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Synchronisation abgeschlossen</p>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">Ihre Daten sind wieder aktuell.</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-green-700 active:scale-95"
        >
          OK <span className="tabular-nums opacity-90">({secondsLeft})</span>
        </button>
      </div>
      <div className="h-1 w-full bg-green-100 dark:bg-green-900/40">
        <div
          className="h-full origin-left bg-green-500 transition-transform duration-1000 ease-linear"
          style={{ transform: `scaleX(${secondsLeft / DISPLAY_SECONDS})` }}
        />
      </div>
    </div>
  );
}
