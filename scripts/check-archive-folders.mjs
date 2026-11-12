import assert from 'node:assert/strict';
import { archiveRootName, backupDirectorySegments } from '../src/lib/archiveRoot.ts';
import { ensureYearStructure, ensureReportFolder, savePdfInFolder } from '../src/lib/archiveFolders.ts';

class MemoryHandle {
  constructor(dir,name){this.dir=dir;this.name=name;}
  async getFile(){
    const contents=this.dir.files.get(this.name);
    const b=new Blob([contents]);
    return {size:b.size,arrayBuffer:()=>b.arrayBuffer()};
  }
  async createWritable(){
    let bytes;
    return {
      write:async(value)=>{ bytes=value instanceof Blob ? await value.text() : String(value); },
      close:async()=>{if(bytes===undefined)throw Error('Unwritten file');this.dir.files.set(this.name,bytes);this.dir.writes.push(this.name);},
      abort:async()=>{},
    };
  }
}
class MemoryFolder {
  constructor(){this.folders=new Map();this.files=new Map();this.writes=[];this.created=[];}
  async getDirectoryHandle(name,{create=false}={}){
    if(!this.folders.has(name)){
      if(!create)throw new DOMException('Missing','NotFoundError');
      this.folders.set(name,new MemoryFolder());this.created.push(name);
    }
    return this.folders.get(name);
  }
  async getFileHandle(name,{create=false}={}){
    if(!this.files.has(name)){
      if(!create)throw new DOMException('Missing','NotFoundError');
      this.files.set(name,'');
    }
    return new MemoryHandle(this,name);
  }
}
const parent=new MemoryFolder();
const dec=Date.parse('2026-12-31T22:30:00Z');
const jan=Date.parse('2026-12-31T23:30:00Z');
assert.equal(archiveRootName(dec),'Kasse 26');
assert.equal(archiveRootName(jan),'Kasse 27');
assert.deepEqual(backupDirectorySegments(jan,'Backup1'),['Kasse 27','Sicherung','Backup1']);
const base26=await ensureYearStructure(parent,dec);
const originalLocation=base26.folders.get('Friedrichshafen');
const originalBackup=base26.folders.get('Sicherung').folders.get('Backup1');
assert.deepEqual(parent.created,['Kasse 26']);
assert.deepEqual(base26.created,['Friedrichshafen','Bregenz','Alle-Standorte','Sicherung']);
await ensureYearStructure(parent,dec);
assert.deepEqual(parent.created,['Kasse 26'],'Vorhandener Hauptordner nicht duplizieren.');
assert.strictEqual(originalBackup,base26.folders.get('Sicherung').folders.get('Backup1'));

const report2026={location:'Friedrichshafen',fileName:'Friedrichshafen_Tagesjournal_31-12-2026.pdf',reportPeriodStart:dec};
const oldFolder=await ensureReportFolder(parent,report2026,jan);
assert.strictEqual(parent.folders.get('Kasse 26'),base26);
assert.strictEqual(originalLocation,base26.folders.get('Friedrichshafen'));
assert.ok(parent.folders.has('Kasse 27'),'Neues Jahr bekommt eigenen Hauptordner.');
assert.ok(originalLocation.folders.has('Dezember'));
assert.equal(originalLocation.folders.has('Januar'),false,'Unbenötigte Monate nicht erstellen.');
const oldMonths=[...originalLocation.folders.keys()];
const sameFolder=await ensureReportFolder(parent,report2026,jan);
assert.strictEqual(sameFolder,oldFolder);
assert.deepEqual([...originalLocation.folders.keys()],oldMonths,'Zweiter Aufruf erzeugt keine Unterordner.');
originalLocation.folders.delete('Dezember');
const recreated=await ensureReportFolder(parent,report2026,jan);
assert.notStrictEqual(recreated,oldFolder,'Fehlender Unterordner wird neu ergänzt.');
assert.strictEqual(base26.folders.get('Friedrichshafen'),originalLocation,'Elternordner erhalten.');
assert.strictEqual(base26.folders.get('Sicherung').folders.get('Backup1'),originalBackup,'Backup bleibt erhalten.');
assert.deepEqual([...originalLocation.folders.keys()],['Dezember'],'Nur fehlender Monat neu.');
const january=await ensureReportFolder(parent,{location:'Bregenz',fileName:'Tagesabschluss.pdf',documentTitle:'Tagesabschluss',reportPeriodStart:jan},jan);
assert.strictEqual(january,parent.folders.get('Kasse 27').folders.get('Bregenz').folders.get('Januar').folders.get('Tagesabschluss'));
assert.equal(base26.folders.get('Bregenz').folders.has('Januar'),false,'Kein falsches Vorjahr.');

const pdf=new Blob(['PDF-v1'],{type:'application/pdf'});
const other=new Blob(['PDF-v2'],{type:'application/pdf'});
assert.equal(await savePdfInFolder(recreated,'Test.pdf',pdf,true),'created');
const n=recreated.writes.length;
assert.equal(await savePdfInFolder(recreated,'Test.pdf',pdf,true),'unchanged');
assert.equal(recreated.writes.length,n,'Identische PDF darf nicht neu geschrieben werden.');
await assert.rejects(savePdfInFolder(recreated,'Test.pdf',other,true),/PDF-Konflikt/);
assert.equal(recreated.files.get('Test.pdf'),'PDF-v1','Endgültiger PDF-Inhalt unangetastet.');
assert.equal(await savePdfInFolder(recreated,'Journal.pdf',pdf,false),'created');
assert.equal(await savePdfInFolder(recreated,'Journal.pdf',other,false),'updated');
assert.equal(await savePdfInFolder(recreated,'Journal.pdf',other,false),'unchanged');
console.log('ARCHIV-ORDNER: Kasse 26/27, nur fehlende Unterordner, Monatswechsel, historische Berichte, PDF-Konfliktschutz OK.');
