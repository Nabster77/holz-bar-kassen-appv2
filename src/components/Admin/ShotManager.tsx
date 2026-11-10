import { useEffect, useRef, useState } from 'react';
import type { ShotOption } from '@/types';

type Row = { id: string; name: string; price: string; Friedrichshafen: string; Bregenz: string };
const locations = ['Friedrichshafen', 'Bregenz'] as const;
const rowsFrom = (shots: ShotOption[]): Row[] => shots.map(s => ({
  id: s.id, name: s.name, price: s.price.toFixed(2).replace('.', ','),
  Friedrichshafen: s.locationPrices?.Friedrichshafen?.toFixed(2).replace('.', ',') ?? '',
  Bregenz: s.locationPrices?.Bregenz?.toFixed(2).replace('.', ',') ?? '',
}));
const price = (raw: string): number | null => {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(raw.trim())) return null;
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n <= 99999 ? Math.round(n * 100) / 100 : null;
};

export function ShotManager({ shots, onChange, onDirtyChange }: { shots: ShotOption[]; onChange: (shots: ShotOption[]) => void; onDirtyChange: (dirty: boolean) => void }) {
  // A snapshot remains fixed while editing so remote changes never replace drafts.
  const [base, setBase] = useState(shots);
  const [rows, setRows] = useState(() => rowsFrom(shots));
  const [showLocations, setShowLocations] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef<string | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(rowsFrom(base));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const conflict = JSON.stringify(shots) !== JSON.stringify(base);
  useEffect(() => {
    if (pending.current === JSON.stringify(shots) || !dirty) {
      pending.current = null;
      setBase(shots);
      setRows(rowsFrom(shots));
    }
  }, [shots, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const errors = rows.map(row => {
    const result: Partial<Record<keyof Row, string>> = {};
    if (!row.name.trim()) result.name = 'Name fehlt.';
    else if (rows.some(other => other.id !== row.id && other.name.trim().toLocaleLowerCase('de-DE') === row.name.trim().toLocaleLowerCase('de-DE'))) result.name = 'Name bereits vorhanden.';
    if (price(row.price) === null) result.price = 'Preis von 0 bis 99.999 mit höchstens zwei Nachkommastellen eingeben.';
    for (const location of locations) if (row[location].trim() && price(row[location]) === null) result[location] = 'Gültigen Preis eingeben oder Feld leeren.';
    return result;
  });
  const invalid = errors.some(error => Object.keys(error).length > 0);
  const reset = () => { pending.current = null; setBase(shots); setRows(rowsFrom(shots)); setNotice(''); };
  const save = () => {
    if (!dirty || conflict || invalid) return;
    const next = rows.map(row => {
      const locationPrices: NonNullable<ShotOption['locationPrices']> = {};
      for (const location of locations) if (row[location].trim()) locationPrices[location] = price(row[location])!;
      return { ...base.find(s => s.id === row.id), id: row.id, name: row.name.trim(), price: price(row.price)!,
        locationPrices: Object.keys(locationPrices).length ? locationPrices : undefined };
    });
    pending.current = JSON.stringify(next);
    onChange(next);
    setNotice('Änderung automatisch übernommen. Der Cloud-Status steht oben in der Kopfzeile.');
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || invalid || conflict) return;
    // Commit valid edits automatically after typing stops. This also covers
    // deleting a row or switching tabs without requiring a manual save.
    const timer = window.setTimeout(() => saveRef.current(), 900);
    return () => window.clearTimeout(timer);
  }, [rows, dirty, invalid, conflict]);

  const update = (id: string, field: keyof Row, value: string) => {
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
    setNotice('');
  };
  const inputClass = 'w-full min-w-[6rem] rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white';
  const cell = (row: Row, field: 'name' | 'price' | typeof locations[number], index: number) => {
    const error = errors[index][field];
    return <td key={field} className="p-2 align-top">
      <input aria-label={field === 'name' ? 'Schussartikel Name' : `${row.name || 'Neuer Artikel'}: ${field === 'price' ? 'Grundpreis' : field}`}
        aria-invalid={!!error} aria-describedby={error ? `shot-${row.id}-${field}-error` : undefined}
        inputMode={field === 'name' ? 'text' : 'decimal'} value={row[field]}
        placeholder={field === 'name' ? 'Neue Schuss-Sorte' : field === 'price' ? '2,00' : 'Grundpreis gilt'}
        onChange={event => update(row.id, field, event.target.value)} onBlur={() => { if (dirty && !invalid && !conflict) saveRef.current(); }} className={inputClass} />
      {error && <p id={`shot-${row.id}-${field}-error`} className="mt-1 text-xs text-red-600 dark:text-red-300">{error}</p>}
    </td>;
  };
  return <div className="space-y-4">
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-900/20">
      <h3 className="text-lg font-bold text-violet-900 dark:text-violet-100">SCHUSS – zentrale Verwaltung</h3>
      <p className="mt-1 text-sm text-violet-800 dark:text-violet-200">Namen und Preise direkt ändern: Beim Verlassen des Feldes oder nach kurzer Eingabepause wird automatisch gespeichert und mit der Cloud abgeglichen. Leere Standortpreise übernehmen den Grundpreis.</p>
    </div>
    <label className="flex items-center gap-2 text-sm dark:text-white">
      <input type="checkbox" checked={showLocations} onChange={event => setShowLocations(event.target.checked)} /> Standortpreise anzeigen
    </label>
    {!showLocations && rows.some(row => row.Friedrichshafen || row.Bregenz) && <p className="text-sm text-gray-600 dark:text-gray-300">Standortpreise sind hinterlegt und bleiben erhalten. Zum Bearbeiten Standortpreise anzeigen.</p>}
    {conflict && dirty && <p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm dark:text-white">Die gespeicherte Liste wurde zwischenzeitlich geändert. Deine Eingaben bleiben sichtbar. Bitte Änderungen verwerfen und auf Grundlage des aktuellen Stands erneut eingeben.</p>}
    <div className="overflow-x-auto rounded-xl border border-gray-300 dark:border-gray-700">
      <table className="w-full text-left text-sm dark:text-white">
        <thead className="bg-gray-100 dark:bg-gray-800"><tr>
          <th scope="col" className="p-2">Schussartikel</th><th scope="col" className="p-2">Grundpreis €</th>
          {showLocations && locations.map(location => <th scope="col" className="p-2" key={location}>{location} €</th>)}
          <th scope="col" className="p-2">Aktion</th>
        </tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id} className={JSON.stringify(row) !== JSON.stringify(rowsFrom(base).find(s => s.id === row.id)) ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
          {cell(row, 'name', index)}{cell(row, 'price', index)}
          {showLocations && locations.map(location => cell(row, location, index))}
          <td className="p-2 align-top"><button type="button" className="rounded-lg border border-red-300 px-3 py-2 text-red-700 dark:text-red-300"
            onClick={() => { if (window.confirm('Schuss-Sorte „' + (row.name || 'Neue Sorte') + '“ aus der Liste entfernen? Wirksam nach Speichern.')) { setRows(current => current.filter(s => s.id !== row.id)); setNotice(''); } }}>Entfernen</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => { setRows(current => [...current, { id: 'shot-' + crypto.randomUUID(), name: '', price: '', Friedrichshafen: '', Bregenz: '' }]); setNotice(''); }} className="rounded-lg border px-4 py-2 dark:text-white">+ Schussartikel</button>
      <button type="button" disabled={!dirty || invalid || conflict} onClick={save} className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white disabled:opacity-40">Jetzt speichern</button>
      <button type="button" disabled={!dirty} onClick={reset} className="rounded-lg border px-4 py-2 disabled:opacity-40 dark:text-white">Verwerfen</button>
      {dirty && <span className="text-sm text-amber-700 dark:text-amber-300">Ungespeicherte Änderungen</span>}
    </div>
    <p role="status" className="text-sm text-gray-600 dark:text-gray-300">{notice}</p>
  </div>;
}
