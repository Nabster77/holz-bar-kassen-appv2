import { useState } from 'react';
import type { LocalCatalog } from '@/lib/catalogSync';
import type { CatalogImportSession } from '@/lib/catalogEngine';
import { buildImportPlan, exportWorkbook, exportTemplateWorkbook, readImageZip, readWorkbook, type ImportPlan } from '@/lib/catalogTransfer';
import { uploadArticleImage } from '@/lib/imageUpload';
import { importFileToDataURL } from '@/lib/imageImport';
import { supabase } from '@/lib/supabaseClient';
import { createCatalogIllustration } from '@/lib/catalogIllustration';

export interface CatalogTransferProps {
  catalog: LocalCatalog;
  testMode: boolean;
  onPrepare: () => Promise<CatalogImportSession>;
  onCommit: (session: CatalogImportSession, next: LocalCatalog) => Promise<void>;
  onClose: () => void;
}
export function CatalogTransferDialog({ catalog, testMode, onPrepare, onCommit, onClose }: CatalogTransferProps) {
  const [excel, setExcel] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [zipSummary, setZipSummary] = useState('');
  const [generated, setGenerated] = useState<Record<string, {url:string; bytes:Uint8Array}>>({});
  const [replace, setReplace] = useState(false);
  const [autoIllustrations, setAutoIllustrations] = useState(true);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [session, setSession] = useState<CatalogImportSession | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<{done:number;total:number;stage:string} | null>(null);
  const [message, setMessage] = useState('');
  const [fileError, setFileError] = useState('');
  const [done, setDone] = useState(false);
  const invalidate = () => {setGenerated({});setZipSummary('');setPlan(null); setSession(null); setConfirmed(false); setDone(false); setImportProgress(null); setMessage('');};
  const stale = session && JSON.stringify(session.base) !== JSON.stringify(catalog);
  function chooseFile(file: File | null, kind: 'excel' | 'zip') {
    invalidate();
    if (!file) {
      if (kind === 'excel') setExcel(null); else setZip(null);
      return;
    }
    const expected = kind === 'excel' ? '.xlsx' : '.zip';
    const limit = kind === 'excel' ? 10 : 100;
    if (!file.name.toLocaleLowerCase('de-DE').endsWith(expected)) {
      if (kind === 'excel') setExcel(null); else setZip(null);
      setFileError(`Falsches Dateiformat: Für ${kind === 'excel' ? 'Excel' : 'Bilder'} bitte eine ${expected}-Datei auswählen. „${file.name}“ wurde nicht übernommen.`);
      return;
    }
    if (file.size > limit * 1024 * 1024) {
      if (kind === 'excel') setExcel(null); else setZip(null);
      setFileError(`„${file.name}“ ist zu groß. Maximum: ${limit} MB.`);
      return;
    }
    if (kind === 'excel') setExcel(file); else setZip(file);
  }
  async function preview() {
    if (!excel) return;
    setBusy(true); invalidate();
    try {
      if (excel.size > 10 * 1024 * 1024) throw new Error('Excel-Datei ist größer als 10 MB.');
      if (zip && zip.size > 100 * 1024 * 1024) throw new Error('ZIP ist größer als 100 MB.');
      const sheets = await readWorkbook(await excel.arrayBuffer());
      const images = zip ? readImageZip(new Uint8Array(await zip.arrayBuffer())) : [];
      for (const image of images) {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(image.bytes)], {type:image.mime}));
        const tooLarge = bitmap.width > 800 || bitmap.height > 800;
        bitmap.close();
        if (tooLarge) throw new Error(`Bild „${image.path}“ ist größer als 800 × 800 Pixel. Bitte vor dem ZIP-Erstellen verkleinern.`);
      }
      const counts = new Map<string, number>();
      for (const image of images) { const folder = image.path.includes('/') ? image.path.split('/')[0] : '(Hauptordner)'; counts.set(folder, (counts.get(folder) ?? 0) + 1); }
      setZipSummary(zip ? `ZIP „${zip.name}“: ${images.length} Bilder erkannt (${Array.from(counts, ([folder, count]) => `${folder}: ${count}`).join(', ') || 'keine Bilddateien'}).` : 'Keine ZIP-Datei ausgewählt.');
      const snapshot = testMode ? {base: structuredClone(catalog), cloud: []} : await onPrepare();
      setSession(snapshot); setPlan(buildImportPlan(sheets, snapshot.base, images, replace));
    } catch (e) {setFileError((e as Error).message);} finally {setBusy(false);}
  }
  async function generateImage(productId: string, name: string) {
    if (!supabase || !plan || busy || testMode || generated[productId]) return;
    setBusy(true); setMessage('');
    try {
      const {data,error} = await supabase.functions.invoke('generate-catalog-image',{body:{name}});
      if (error || !data?.image || data.mime !== 'image/png') throw new Error('KI-Bilddienst nicht eingerichtet oder nicht erreichbar.');
      const binary = atob(data.image as string);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const blob = new Blob([new Uint8Array(bytes)],{type:'image/png'});
      const url = URL.createObjectURL(blob);
      setGenerated(prev => ({...prev,[productId]:{url,bytes}}));
    } catch (e) {setMessage((e as Error).message);}
    finally {setBusy(false);}
  }
  function discardGenerated(productId: string) {
    const item = generated[productId];
    if (item) URL.revokeObjectURL(item.url);
    setGenerated(prev => {const next={...prev};delete next[productId];return next;});
  }
  async function commit() {
    if (!plan || !session || !confirmed || plan.errors.length || stale || testMode || busy || done) return;
    setBusy(true); setMessage('');
    const imageCount = Object.keys(plan.images).length + Object.keys(generated).length + (autoIllustrations ? plan.next.products.filter(p => !p.imageUrl && !plan.images[p.id] && !generated[p.id] && plan.rows.some(r => r.kind === 'Artikel' && r.id === p.id)).length : 0);
    const totalSteps = imageCount + 1;
    let completedSteps = 0;
    setImportProgress({done:0,total:totalSteps,stage:'Bilder vorbereiten'});
    let uploaded = 0;
    try {
      const next = structuredClone(plan.next);
      // Validate and decode each image. Unique object names preserve old storage objects.
      for (const [productId, image] of Object.entries(plan.images)) {
        const file = new File([new Uint8Array(image.bytes)], image.path.split('/').pop()!, {type: image.mime});
        let converted = file;
        if (image.mime !== 'image/webp') {
          const dataUrl = await importFileToDataURL(file);
          const blob = await (await fetch(dataUrl)).blob();
          converted = new File([blob], 'image', {type: blob.type});
        } else {
          const bitmap = await createImageBitmap(file); bitmap.close();
        }
        const bitmapCheck = await createImageBitmap(converted);
        const tooLarge = bitmapCheck.width > 800 || bitmapCheck.height > 800;
        bitmapCheck.close();
        if (tooLarge || converted.size > 500 * 1024) throw new Error(`Bild „${image.path}“ überschreitet 800 × 800 Pixel oder 500 KB.`);
        const url = await uploadArticleImage(converted);
        if (!url) throw new Error(`Bild „${image.path}“ konnte nicht hochgeladen werden. Katalog wurde nicht importiert. Bereits hochgeladene neue Bilder bleiben unreferenziert; vorhandene Bilder bleiben erhalten.`);
        uploaded++; completedSteps++; setImportProgress({done:completedSteps,total:totalSteps,stage:'ZIP-Bilder hochladen'});
        next.products.find(p => p.id === productId)!.imageUrl = url;
      }
      for (const [productId, generatedImage] of Object.entries(generated)) {
        const product = next.products.find(p => p.id === productId);
        if (!product || (product.imageUrl && !replace)) continue;
        const url = await uploadArticleImage(new File([new Uint8Array(generatedImage.bytes)], 'ki-bild.png', {type:'image/png'}));
        if (!url) throw new Error('KI-Bild konnte nicht gespeichert werden; Katalog wurde nicht importiert.');
        uploaded++; completedSteps++; setImportProgress({done:completedSteps,total:totalSteps,stage:'Bilder hochladen'}); product.imageUrl = url;
      }
      if (autoIllustrations) {
        for (const product of next.products) {
          if (product.imageUrl || plan.images[product.id] || generated[product.id]) continue;
          if (!plan.rows.some(r => r.kind === 'Artikel' && r.id === product.id)) continue;
          const illustration = await createCatalogIllustration(product.name);
          const url = await uploadArticleImage(illustration);
          if (!url) throw new Error(`Illustration für „${product.name}“ konnte nicht gespeichert werden.`);
          uploaded++; completedSteps++; setImportProgress({done:completedSteps,total:totalSteps,stage:'Illustrationen hochladen'}); product.imageUrl = `${url}${url.includes('?') ? '&' : '?'}woodmoIllustration=1`;
        }
      }
      setImportProgress({done:completedSteps,total:totalSteps,stage:'Katalog in Supabase speichern'});
      await onCommit(session, next);
      setImportProgress({done:totalSteps,total:totalSteps,stage:'Import abgeschlossen'});
      setDone(true); setConfirmed(false); setMessage('Import vollständig in Supabase gespeichert und lokal übernommen.');
    } catch (e) {
      setMessage(`${(e as Error).message}${uploaded ? ` ${uploaded} neue Bilddateien wurden hochgeladen und können unreferenziert sein. Vor erneutem Import synchronisieren und Vorschau neu erstellen.` : ''}`); setConfirmed(false);
      // After an uncertain network result, force a fresh cloud read rather than retrying stale data.
      setSession(null);
    } finally {setBusy(false);}
  }
  async function downloadTemplate() {
    setBusy(true); setMessage('');
    try {
      const bytes = await exportTemplateWorkbook();
      const url = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a = document.createElement('a');
      a.href = url; a.download = 'WOODMO-Excel-Mustervorlage.xlsx'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {setMessage((e as Error).message);} finally {setBusy(false);}
  }
  async function download() {
    setBusy(true); setMessage('');
    try {
      const bytes = await exportWorkbook(catalog);
      const url = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a = document.createElement('a'); a.href = url; a.download = `Sicherung_WOODMO-Katalog-${new Date().toLocaleDateString('en-CA')}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {setMessage((e as Error).message);} finally {setBusy(false);}
  }
  const button = 'rounded-xl border border-gray-400 px-4 py-2 disabled:opacity-40';
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="catalog-transfer-title">
    <div className="flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-5 text-gray-900 shadow-2xl dark:bg-gray-800 dark:text-white">
      <div className="flex items-center justify-between gap-4"><h2 id="catalog-transfer-title" className="text-lg font-bold">Excel-Import / Export</h2><button disabled={busy} onClick={onClose} className={button}>Schließen</button></div>
      {fileError && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation">
        <div role="alertdialog" aria-modal="true" aria-labelledby="catalog-file-error-title" aria-describedby="catalog-file-error-text" className="w-full max-w-md rounded-xl bg-white p-5 text-gray-900 shadow-2xl dark:bg-gray-800 dark:text-white">
          <h3 id="catalog-file-error-title" className="text-lg font-bold text-red-600">Dateifehler</h3>
          <p id="catalog-file-error-text" className="my-4">{fileError}</p>
          <button autoFocus type="button" onClick={() => setFileError('')} className={button}>OK</button>
        </div>
      </div>}
      <div className="mt-3 overflow-auto space-y-4">
        <p className="text-sm">Artikel, Warengruppen, Standortpreise, Preisarten, Pfand und Steuern für DE / AT. SCHUSS-Sorten werden ausschließlich in der zentralen SCHUSS-Verwaltung gespeichert. Einträge, die in Excel fehlen, bleiben erhalten. Buchungen und Kassensitzungen werden nicht verändert.</p>
        <div className="rounded-xl border-2 border-red-600 p-3 text-sm text-red-700 dark:text-red-300" role="note">
          <strong>WICHTIG – Import richtig vorbereiten:</strong> Lade zuerst die „Excel-Mustervorlage“ herunter. Du darfst Artikel, Preise und Pfandbeträge ändern oder weitere Artikelzeilen ergänzen. Behalte die Pfandzeilen oberhalb der Tabelle und die acht Spaltenüberschriften bei.
          <p className="mt-2"><strong>Dateien:</strong> Produktbilder in einem ZIP-Archiv (.zip) speichern; Unterordner mit Bildern sind erlaubt. Pro Bild max. 500 KB und 800 × 800 Pixel; erlaubt sind PNG, JPG/JPEG, WebP und BMP. <span className="mt-3 block rounded-lg border border-red-400 bg-red-950/20 px-3 py-3 leading-relaxed"><strong className="block text-base font-bold tracking-normal">WICHTIG: Bilddateiname muss zum Produktnamen passen!</strong><span className="mt-1 block text-sm">Beispiel: „Gluehwein Rot.png“ zu „Glühwein Rot“.</span></span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={download} className={button}>Vollständigen Katalog als Excel exportieren</button>
          <button disabled={busy} onClick={downloadTemplate} className={button}>Excel-Mustervorlage herunterladen</button>
          <button type="button" aria-expanded={helpOpen} onClick={() => setHelpOpen(v => !v)} className={button}>{helpOpen ? 'Excel- & Bilder-Anleitung schließen' : 'Wie muss ich meine Excel-Tabelle und Bilder-ZIP vorbereiten?'}</button>
        </div>
        {helpOpen && <section className="space-y-3 rounded-xl border border-gray-400 p-3 text-sm">
          <h3 className="font-semibold">Excel-Tabelle richtig anlegen</h3>
          <p className="font-semibold text-red-700 dark:text-red-300">WICHTIG: Die herunterladbare Excel-Mustervorlage als Grundlage verwenden! Pfandzeilen und Spaltenüberschriften beibehalten; nur Werte und Artikel anpassen bzw. ergänzen.</p>
          <p>Oberhalb der Kopfzeile stehen die Pfandbeträge: in Spalte A „Friedrichshafen“ und „Bregenz“, in Spalte B jeweils der gewünschte Betrag in Euro. Die Beträge dürfen je Stadt unterschiedlich sein und werden beim Import übernommen.</p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-left text-sm">
              <thead><tr><th className="border border-gray-400 p-2">Standort</th><th className="border border-gray-400 p-2">Pfand</th></tr></thead>
              <tbody>
                <tr><td className="border border-gray-400 p-2">Friedrichshafen</td><td className="border border-gray-400 p-2">1,00 €</td></tr>
                <tr><td className="border border-gray-400 p-2">Bregenz</td><td className="border border-gray-400 p-2">2,00 €</td></tr>
              </tbody>
            </table>
          </div>
          <p>Diese Beträge sind nur Beispiele. Trage in deiner Excel-Datei die tatsächlichen Pfandbeträge je Standort ein. Danach folgt eine Leerzeile und die Artikel-Kopfzeile.</p>
          <div className="overflow-x-auto">
            <table className="min-w-max border-collapse text-left text-xs">
              <thead><tr>{['Produktname App','VK','Warengruppe','Preis fix / individuell','Steuer DE in %','Steuer AT in %','Schuss','Pfand'].map(h => <th key={h} className="border border-gray-400 p-2">{h}</th>)}</tr></thead>
              <tbody>
                <tr>{['Glühwein Rot','4,5','Getränke','fix','19','20','x','x'].map((v,i) => <td key={i} className="border border-gray-400 p-2">{v}</td>)}</tr>
                <tr>{['Glühwein Weiß','4,5','Getränke','fix','19','20','x','x'].map((v,i) => <td key={i} className="border border-gray-400 p-2">{v}</td>)}</tr>
                <tr>{['Küchenbretter','0','Handwerk','individuell','19','20','',''].map((v,i) => <td key={i} className="border border-gray-400 p-2">{v}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p><strong>Preis:</strong> „fix“ bedeutet fester Verkaufspreis, „individuell“ erlaubt die Eingabe an der Kasse. <strong>Steuer DE</strong> gilt für Friedrichshafen, <strong>Steuer AT</strong> für Bregenz. <strong>Schuss und Pfand:</strong> „x“ aktiviert das jeweilige Häkchen, eine leere Zelle deaktiviert es. Der Pfandbetrag kommt aus dem oberen Tabellenbereich.</p>
          <h3 className="font-semibold">Eigene Artikelbilder als ZIP hinzufügen (optional)</h3>
          <p className="font-semibold text-red-700 dark:text-red-300">WICHTIG: Alle Produktbilder in ein ZIP-Archiv (.zip) packen; Unterordner sind erlaubt. Jedes Bild maximal 500 KB, höchstens 800 × 800 Pixel und nur PNG, JPG/JPEG, WebP oder BMP. <span className="mt-3 block rounded-lg border border-red-400 px-3 py-3 leading-relaxed"><strong className="block text-base font-bold tracking-normal">Bilddateiname muss zum Produktnamen passen!</strong><span className="mt-1 block text-sm">Umlaute dürfen als ae/oe/ue geschrieben werden.</span></span></p>
          <p>Lege deine Produktbilder in einen Ordner und komprimiere ihn als ZIP-Datei. Benenne jedes Bild wie den Artikel in der Spalte „Produktname App“, zum Beispiel „Glühwein Rot.png“ und „Glühwein Weiß.jpg“. Deutsche Umlaute werden auch als ae, oe oder ue erkannt: „Gluehwein Rot.png“ passt zu „Glühwein Rot“. Unterstützt werden PNG, JPG/JPEG, WebP und BMP. ZIP-Unterordner sind möglich. Wähle beim Import sowohl die Excel-Datei als auch die ZIP-Datei aus. Ohne ZIP werden die Artikel trotzdem importiert; vorhandene Bilder bleiben erhalten, sofern du den Bildersatz nicht ausdrücklich aktivierst.</p>
          <p>Ältere Excel-Spaltennamen werden weiterhin unterstützt. Für die neue Tabelle empfehlen wir die herunterladbare Mustervorlage.</p>
        </section>}
        <p className="text-xs text-red-700 dark:text-red-300">Falsche Dateitypen werden beim Auswählen abgefangen und vor der Vorschau auf ihren Inhalt geprüft.</p>
        <label className="block">Excel (.xlsx)<input disabled={busy} className="ml-3" type="file" accept=".xlsx" onChange={e => {chooseFile(e.target.files?.[0] ?? null, 'excel'); e.target.value = '';}} /></label>
        <label className="block">Bilder-ZIP (optional)<input disabled={busy} className="ml-3" type="file" accept=".zip" onChange={e => {chooseFile(e.target.files?.[0] ?? null, 'zip'); e.target.value = '';}} /></label>
        <label className="flex items-center gap-2"><input disabled={busy} type="checkbox" checked={replace} onChange={e => {invalidate();setReplace(e.target.checked);}} />Vorhandene Bildzuordnungen ausdrücklich ersetzen (alte Bilddateien bleiben erhalten)</label>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={autoIllustrations} onChange={e => {invalidate();setAutoIllustrations(e.target.checked);}} />Fehlende Artikelbilder automatisch kostenlos illustrieren (ohne KI/API; eigene Fotos bleiben erhalten)</label>
        <p className="text-sm">ZIP-Unterordner werden berücksichtigt. Groß-/Kleinschreibung, Umlaute, Leerzeichen und Kopienummern wie „(2)“ werden beim Bildabgleich vereinheitlicht. Bei abweichenden Namen werden unverbindliche Bildvorschläge angezeigt; sie werden nicht automatisch importiert.</p>
        {zipSummary && <p role="status" className="text-sm font-semibold">{zipSummary}</p>}
        {testMode && <p className="rounded-xl bg-amber-100 p-3 text-amber-900">Testmodus: lokale Vorschau und Export möglich. Import und Bild-Uploads sind gesperrt. Für den vollständigen Test einen isolierten Supabase-Testbestand verwenden.</p>}
        <button disabled={busy || !excel} onClick={preview} className={button}>{busy ? 'Bitte warten …' : 'Vorschau erstellen'}</button>
        {message && <p role="status" className="rounded-xl border border-blue-400 p-3 whitespace-pre-wrap">{message}</p>}
        {plan && <>
          <p className="font-semibold">{plan.rows.filter(r => r.status === 'neu').length} neu · {plan.rows.filter(r => r.status === 'geändert').length} geändert · {plan.rows.filter(r => r.status === 'unverändert').length} unverändert · {plan.errors.length} Konflikte</p>
          {autoIllustrations && <p className="rounded-xl border border-emerald-500 p-3 text-sm">Kostenlose Bildautomatik aktiviert: Für Artikel ohne eigenes oder ZIP-Bild wird beim bestätigten Import automatisch eine einfache Illustration erstellt. Es wird kein KI-Dienst aufgerufen. Vorhandene Bilder bleiben erhalten.</p>}
          {plan.errors.length > 0 && <div role="alert" className="rounded-xl border border-red-500 p-3"><strong>Import gesperrt – Konflikte zuerst beheben:</strong><ul className="list-disc pl-5">{plan.errors.map((e,i) => <li key={i}>{e}</li>)}</ul></div>}
          {plan.warnings.length > 0 && <details><summary>{plan.warnings.length} Bildhinweise</summary><ul className="list-disc pl-5">{plan.warnings.map((w,i) => <li key={i}>{w}</li>)}</ul></details>}
          {!autoIllustrations && plan.rows.filter(r => r.kind === 'Artikel' && r.id && !plan.images[r.id] && !plan.next.products.find(p => p.id === r.id)?.imageUrl).length > 0 && <section className="space-y-2 rounded-xl border border-gray-400 p-3">
            <h3 className="font-semibold">KI-Bilder für Artikel ohne Bild (optional)</h3>
            <p className="text-sm">Erst nach Klick erzeugen (kostenpflichtiger Dienst). Vor dem Import ansehen; nur bestätigte Vorschläge werden beim Import hochgeladen. Ohne KI-Bild wird der Artikel normal angelegt.</p>
            {plan.rows.filter(r => r.kind === 'Artikel' && r.id && !plan.images[r.id] && !plan.next.products.find(p => p.id === r.id)?.imageUrl).map(r => <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-gray-400 py-2">
              <span className="font-medium">{r.name}</span>
              {generated[r.id!] ? <>
                <img src={generated[r.id!].url} alt={`KI-Vorschau: ${r.name}`} className="h-24 w-24 rounded object-cover" />
                <button className={button} disabled={busy} onClick={() => discardGenerated(r.id!)}>Bild verwerfen</button>
                <span className="text-sm">Bild für Import ausgewählt</span>
              </> : <button className={button} disabled={busy || testMode || !supabase} onClick={() => void generateImage(r.id!,r.name)}>KI-Bild erstellen und prüfen</button>}
            </div>)}
          </section>}
          <div className="max-h-80 overflow-auto rounded-xl border border-gray-400"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-gray-100 dark:bg-gray-900"><tr><th className="p-2">Typ</th><th>Name</th><th>Status</th><th>Änderungen / Bild</th></tr></thead><tbody>{plan.rows.map((r,i) => <tr className="border-t border-gray-300 align-top" key={i}><td className="p-2">{r.kind}</td><td className="p-2">{r.name}</td><td className="p-2">{r.status}</td><td className="p-2 break-all"><details><summary>{r.changes.length} Feldänderungen{r.image ? ` · ZIP: ${r.image}${replace ? ' (Bildersatz freigegeben)' : ''}` : ''}</summary>{r.changes.map((c,j) => <p key={j}>{c}</p>)}</details></td></tr>)}</tbody></table></div>
          {stale && !done && <p role="alert">Der lokale Katalog hat sich geändert. Bitte Vorschau neu erstellen.</p>}
          <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || done || !session || !!stale || testMode || !!plan.errors.length} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Ich habe die Vorschau einschließlich SCHUSS-, Pfand- und Bildänderungen geprüft und bestätige den Import.</label>
          {importProgress && <div role="status" className="space-y-1 rounded-xl border border-gray-400 p-3"><p className="text-sm font-semibold">Import: {Math.round(importProgress.done / importProgress.total * 100)} % – {importProgress.stage}</p><progress className="w-full" max={importProgress.total} value={importProgress.done} /> <p className="text-xs">Fortschritt der abgeschlossenen Schritte; der aktuelle Upload oder Datenbankvorgang kann länger dauern.</p></div>}
          <button className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-40" disabled={!confirmed || busy || done || !session || !!stale || testMode || !!plan.errors.length} onClick={commit}>Jetzt verbindlich importieren</button>
        </>}
      </div>
    </div>
  </div>;
}
