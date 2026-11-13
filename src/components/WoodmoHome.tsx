import { Cloud, LockKeyhole, Settings2, WifiOff } from 'lucide-react';
import type { Location } from '@/types';

interface Props {
  onCash: () => void;
  onAdmin: () => void;
  sessionOpen: boolean;
  location: Location;
  status: 'ok' | 'pending' | 'error';
  testMode: boolean;
}

/** WOODMO home: two existing routes, no invented features or register mutations. */
export function WoodmoHome({ onCash, onAdmin, sessionOpen, location, status, testMode }: Props) {
  const symbol = `${import.meta.env.BASE_URL}woodmo-cashmark-no-text.svg`;
  const watermark = 'pointer-events-none absolute -right-5 top-1/2 h-40 w-40 -translate-y-1/2 rotate-[-12deg] opacity-[0.085] sm:-right-8 sm:h-52 sm:w-52';
  return (
    <section className="flex h-full min-h-0 items-center justify-center overflow-y-auto rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/80 px-3 py-5 text-white sm:px-6">
      <div className="my-auto flex w-full max-w-3xl flex-col items-center gap-6 py-3 sm:gap-8">
        <div className="text-center">
          <h1 className={`text-3xl font-black tracking-wide sm:text-4xl ${status === 'ok' ? 'woodmo-title-ok' : status === 'error' ? 'woodmo-title-error' : ''}`}>WOODMO</h1>
          <p className="mt-1 text-sm text-slate-300">Kassen-App · Version 3.0</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:gap-5">
          <button type="button" onClick={onCash}
            className="relative isolate flex min-h-40 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-emerald-500/40 bg-emerald-900/40 p-3 text-center shadow-lg transition hover:bg-emerald-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:scale-[0.98] sm:min-h-48 sm:p-6">
            <img src={symbol} alt="" aria-hidden="true" className={watermark} />
            <span className="relative z-10 rounded-xl bg-emerald-700/45 p-2.5">
              <img src={symbol} alt="" className="h-9 w-9 object-contain sm:h-11 sm:w-11" />
            </span>
            <span className="relative z-10 text-lg font-bold sm:text-xl">Kasse</span>
            <span className="relative z-10 text-xs text-emerald-100/90 sm:text-sm">{sessionOpen ? 'Kasse fortsetzen' : 'Kasse eröffnen'}</span>
          </button>
          <button type="button" onClick={onAdmin}
            className="relative isolate flex min-h-40 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-slate-600 bg-slate-800/70 p-3 text-center shadow-lg transition hover:bg-slate-700/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-200 active:scale-[0.98] sm:min-h-48 sm:p-6">
            <img src={symbol} alt="" aria-hidden="true" className={watermark} />
            <span className="relative z-10 rounded-xl bg-slate-600/35 p-3">
              <Settings2 className="h-8 w-8 text-slate-100 sm:h-10 sm:w-10" />
            </span>
            <span className="relative z-10 text-lg font-bold sm:text-xl">Verwaltung</span>
            <span className="relative z-10 flex items-center justify-center gap-1 text-xs text-slate-300 sm:text-sm">
              <LockKeyhole className="h-3.5 w-3.5" /> Administrator
            </span>
          </button>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            {status === 'error' ? <WifiOff className="h-4 w-4 text-red-400" /> : <Cloud className={`h-4 w-4 ${status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}`} />}
            {status === 'error' ? 'Cloud / Abgleich prüfen' : status === 'pending' ? 'Cloud-Abgleich läuft oder steht aus' : 'Cloud verbunden'}
          </span>
          {sessionOpen && <span>{location} · Kasse geöffnet</span>}
          {testMode && <span className="font-semibold text-amber-300">TESTMODUS</span>}
        </div>
      </div>
    </section>
  );
}
