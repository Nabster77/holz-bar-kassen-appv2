import { backupDirectorySegments, type BackupSlot } from './archiveRoot';
import {
  backup1Eligibility, backup2Eligibility,
  type BackupSyncCheckpoint, type BackupSyncConditions,
} from './backupSyncPolicy';

/**
 * Incremental, verifiable backup files beneath the user-selected Kasse 26
 * directory. Only changed JSON sections are written; existing content shards
 * are never replaced. The commit pointer is updated LAST.
 *
 * This is storage infrastructure, not a timer. Caller must ensure Cloud has
 * acknowledged all bookings and enforce staff-presence policy for Backup 2.
 */
interface ArchiveManifest {
  schema: 1;
  backupVersion: number;
  exportedAt: string;
  revision: string;
  sections: Record<string, string>;
}

interface ArchivePointer {
  schema: 1;
  manifestFile: string;
  manifestDigest: string;
}

export interface ArchiveBackup {
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export interface BackupWriteResult {
  revision: string;
  changedSections: string[];
  writtenAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function digest(contents: string): Promise<string> {
  const bytes = new TextEncoder().encode(contents);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2,'0')).join('');
}

async function directory(base: FileSystemDirectoryHandle, configuredAt: number, slot: BackupSlot): Promise<FileSystemDirectoryHandle> {
  let target=base;
  for (const name of backupDirectorySegments(configuredAt, slot)) {
    target=await target.getDirectoryHandle(name,{create:true});
  }
  return target;
}

async function readFile(folder: FileSystemDirectoryHandle, name: string): Promise<string> {
  const handle=await folder.getFileHandle(name);
  return (await handle.getFile()).text();
}

async function readOrNull(folder: FileSystemDirectoryHandle, name: string): Promise<string|null> {
  try { return await readFile(folder,name); }
  catch (error) {
    if (error instanceof DOMException && error.name==='NotFoundError') return null;
    throw error;
  }
}

async function writeAndVerify(folder: FileSystemDirectoryHandle, name: string, contents: string): Promise<void> {
  // All writes are committed on .close(); never claim success without reading.
  const handle=await folder.getFileHandle(name,{create:true});
  const writer=await handle.createWritable();
  try { await writer.write(contents); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch { /* original error wins */ } throw error; }
  if (await readFile(folder,name)!==contents) throw new Error('Sicherungsdatei weicht nach dem Schreiben vom Original ab.');
}

function validateManifest(value: unknown): ArchiveManifest {
  if (!isRecord(value) || value.schema!==1 || typeof value.revision!=='string' ||
      !/^[a-f\d]{64}$/.test(value.revision) || !Number.isInteger(value.backupVersion) ||
      typeof value.exportedAt!=='string' || !Number.isFinite(Date.parse(value.exportedAt)) ||
      !isRecord(value.sections)) throw new Error('Beschädigtes Sicherungsmanifest.');
  for (const [name,hash] of Object.entries(value.sections)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name) ||
        typeof hash!=='string' || !/^[a-f\d]{64}$/.test(hash)) {
      throw new Error('Ungültiger Eintrag im Sicherungsmanifest.');
    }
  }
  return value as unknown as ArchiveManifest;
}

async function currentManifest(folder: FileSystemDirectoryHandle): Promise<ArchiveManifest|null> {
  const raw=await readOrNull(folder,'current.json');
  if (raw===null) return null;
  const pointer: unknown=JSON.parse(raw);
  if (!isRecord(pointer) || pointer.schema!==1 ||
      typeof pointer.manifestDigest!=='string' ||
      typeof pointer.manifestFile!=='string' ||
      !/^manifest-[a-f\d]{64}\.json$/.test(pointer.manifestFile) ||
      pointer.manifestFile!==`manifest-${pointer.manifestDigest}.json`) {
    throw new Error('Sicherungspointer ungültig. Vorherige Sicherung nicht überschreiben.');
  }
  const manifestText=await readFile(folder,pointer.manifestFile);
  if (await digest(manifestText)!==pointer.manifestDigest) throw new Error('Sicherungsmanifest nicht verifizierbar.');
  return validateManifest(JSON.parse(manifestText));
}

async function readSection(folder: FileSystemDirectoryHandle, name: string, hash: string): Promise<string> {
  const text=await readFile(folder,`${name}-${hash}.json`);
  if (await digest(text)!==hash) throw new Error(`Sicherungseintrag ${name} ist beschädigt.`);
  return text;
}

async function commitManifest(folder: FileSystemDirectoryHandle, manifest: ArchiveManifest): Promise<void> {
  const manifestText=JSON.stringify(manifest);
  const manifestDigest=await digest(manifestText);
  const name=`manifest-${manifestDigest}.json`;
  const existing=await readOrNull(folder,name);
  if (existing !== null && existing!==manifestText) throw new Error('Konflikt mit bestehender Manifestversion.');
  if (existing===null) await writeAndVerify(folder,name,manifestText);
  const pointer: ArchivePointer={schema:1,manifestFile:name,manifestDigest};
  await writeAndVerify(folder,'current.json',JSON.stringify(pointer));
  const verified=await currentManifest(folder);
  if (!verified || verified.revision!==manifest.revision) throw new Error('Sicherung nicht vollständig bestätigt.');
}

function assertBackup(backup: ArchiveBackup): void {
  if (!Number.isInteger(backup.version) || backup.version<1 ||
      !Number.isFinite(Date.parse(backup.exportedAt)) || !isRecord(backup.data)) {
    throw new Error('Unvollständige Sicherungsdaten.');
  }
}

/** Stage 1: complete, verified data snapshot, but only changed sections write. */
export async function saveBackup1(
  parent: FileSystemDirectoryHandle,
  configuredAt: number,
  backup: ArchiveBackup,
  state: BackupSyncCheckpoint,
  conditions: BackupSyncConditions,
  manual = false,
): Promise<BackupWriteResult> {
  assertBackup(backup);
  // No writes before Cloud consistency, outbox emptiness and permission are
  // confirmed. Fail closed, never claim an automatic backup succeeded.
  const target=await directory(parent,configuredAt,'Backup1');
  const existing=await currentManifest(target);
  const sections: Record<string,string>={};
  const changedSections: string[]=[];
  for (const name of Object.keys(backup.data).sort()) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)) throw new Error('Ungültiger Sicherungsbereich.');
    const payload=JSON.stringify(backup.data[name]);
    if (typeof payload!=='string') throw new Error(`Sicherungsdaten ${name} unvollständig.`);
    const hash=await digest(payload);
    sections[name]=hash;
    if (existing?.sections[name]===hash) continue;
    const filename=`${name}-${hash}.json`;
    const old=await readOrNull(target,filename);
    if (old !== null && await digest(old)!==hash) throw new Error('Bestehende Sicherung beschädigt.');
    if (old===null) await writeAndVerify(target,filename,payload);
    changedSections.push(name);
  }
  const revision=await digest(JSON.stringify({version:backup.version,sections}));
  const eligibility=backup1Eligibility(state,conditions,revision,manual);
  if (!eligibility.allowed && eligibility.reason!=='up-to-date') {
    throw new Error(`Backup 1 nicht erlaubt: ${eligibility.reason ?? 'unbekannt'}.`);
  }
  if (existing?.revision!==revision) {
    await commitManifest(target,{schema:1,backupVersion:backup.version,exportedAt:backup.exportedAt,revision,sections});
  }
  // Prior manifest is still present if any write fails before pointer commit.
  return {revision,changedSections,writtenAt:Date.now()};
}

/**
 * Stage 2: incrementally mirror verified Backup 1 after global staff logout.
 * Caller must check backup2Eligibility immediately before starting; in-flight
 * copies may finish without blocking the main register.
 */
export async function mirrorBackup2(
  parent: FileSystemDirectoryHandle,
  configuredAt: number,
  state: BackupSyncCheckpoint,
  conditions: BackupSyncConditions,
): Promise<BackupWriteResult> {
  // Enforce the gate here, not only in UI or timer code. Unknown presence
  // on another tablet denies automatic mirroring.
  const eligible=backup2Eligibility(state,conditions);
  if (!eligible.allowed && eligible.reason!=='up-to-date') {
    throw new Error(`Backup 2 nicht erlaubt: ${eligible.reason ?? 'unbekannt'}.`);
  }
  const source=await directory(parent,configuredAt,'Backup1');
  const target=await directory(parent,configuredAt,'Backup2');
  const manifest=await currentManifest(source);
  if (!manifest) throw new Error('Backup 1 wurde noch nicht abgeschlossen.');
  const existing=await currentManifest(target);
  const changedSections: string[]=[];
  // Revision unchanged: verify manifest integrity rather than rewriting.
  if (existing?.revision===manifest.revision) {
    for (const [name,hash] of Object.entries(manifest.sections)) {
      await readSection(source,name,hash);
      await readSection(target,name,hash);
    }
    return {revision:manifest.revision,changedSections,writtenAt:Date.now()};
  }
  for (const [name,hash] of Object.entries(manifest.sections)) {
    // Even an unchanged shard is checked to detect silent corruption before
    // the pointer to a verified backup is accepted.
    const sourceText=await readSection(source,name,hash);
    const filename=`${name}-${hash}.json`;
    const prior=await readOrNull(target,filename);
    if (prior!==null && await digest(prior)!==hash) throw new Error('Backup 2 enthält beschädigte Daten.');
    if (prior===null) await writeAndVerify(target,filename,sourceText);
    if (prior===null || existing?.sections[name]!==hash) changedSections.push(name);
  }
  // If Backup 1 was updated while we copied, the caller can retry from its
  // newer manifest; never falsely mark this older version as current.
  const latest=await currentManifest(source);
  if (!latest || latest.revision!==manifest.revision) throw new Error('Backup 1 wurde während des Kopierens aktualisiert.');
  await commitManifest(target,manifest);
  return {revision:manifest.revision,changedSections,writtenAt:Date.now()};
}

/** Reconstruct ordinary JSON data suitable for the existing import workflow. */
export async function loadArchivedBackup(
  parent: FileSystemDirectoryHandle,
  configuredAt: number,
  slot: BackupSlot,
): Promise<ArchiveBackup> {
  const target=await directory(parent,configuredAt,slot);
  const manifest=await currentManifest(target);
  if (!manifest) throw new Error('Keine vollständige Sicherung vorhanden.');
  const data: Record<string,unknown>={};
  for (const [name,hash] of Object.entries(manifest.sections)) {
    data[name]=JSON.parse(await readSection(target,name,hash));
  }
  const revision=await digest(JSON.stringify({version:manifest.backupVersion,sections:manifest.sections}));
  if (revision!==manifest.revision) throw new Error('Backup-Revision stimmt nicht mit den Dateien überein.');
  return {version:manifest.backupVersion,exportedAt:manifest.exportedAt,data};
}
