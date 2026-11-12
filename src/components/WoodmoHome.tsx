import { Cloud, LockKeyhole, Settings2, WifiOff } from 'lucide-react';
import { WoodmoBrand } from './WoodmoBrand';
import type { Location } from '@/types';

interface Props {
  onCash: () => void;
  onAdmin: () => void;
  sessionOpen: boolean;
  location: Location;
  status: 'ok' | 'pending' | 'error';
  testMode: boolean;
}

/** Entry view: only the two real application routes, never mock features. */
export function WoodmoHome({ onCash, onAdmin, sessionOpen, location, status, testMode }: Props) {
  return (
    <section className="flex h-full min-h-0 items-center justify-center overflow-y-auto rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/80 px-3 py-5 text-white sm:px-6">
      <div className="my-auto flex w-full max-w-3xl flex-col items-center gap-5 py-3 sm:gap-7">
        <WoodmoBrand status={status} size="large" />
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-wide sm:text-3xl">WOODMO</h1>
          <p className="text-sm text-slate-300">Kassen-App · Version 3.0</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:gap-5">
          <button type="button" onClick={onCash}
            className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-900/40 p-3 text-center shadow-lg transition hover:bg-emerald-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:scale-[0.98] sm:min-h-48 sm:p-6">
            <span className="rounded-xl bg-emerald-500/15 p-2.5"><img src={`${import.meta.env.BASE_URL}woodmo-v3-logo.png`} alt="" className="h-10 w-10 rounded-xl object-cover sm:h-12 sm:w-12" /></span>
            <span className="text-lg font-bold sm:text-xl">Kasse</span>
            <span className="text-xs text-emerald-100/90 sm:text-sm">{sessionOpen ? 'Kasse fortsetzen' : 'Kasse eröffnen'}</span>
          </button>
          <button type="button" onClick={onAdmin}
            className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-600 bg-slate-800/70 p-3 text-center shadow-lg transition hover:bg-slate-700/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-200 active:scale-[0.98] sm:min-h-48 sm:p-6">
            <span className="rounded-xl bg-slate-600/35 p-3"><Settings2 className="h-8 w-8 text-slate-100 sm:h-10 sm:w-10" /></span>
            <span className="text-lg font-bold sm:text-xl">Verwaltung</span>
            <span className="flex items-center justify-center gap-1 text-xs text-slate-300 sm:text-sm"><LockKeyhole className="h-3.5 w-3.5" /> Administrator</span>
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
