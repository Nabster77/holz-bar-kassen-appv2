import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { buildCatalogImagesZip, buildCatalogBundle } from '../src/lib/catalogBundleExport.ts';
import { buildImportPlan, readImageZip, readWorkbook } from '../src/lib/catalogTransfer.ts';

const origin='https://my-test-project.supabase.co';
const base=origin+'/storage/v1/object/public/article-images/';
const imagePng=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const imageJpg=new Uint8Array([255,216,255,0,0,0,0]);
const imageWebp=new Uint8Array([82,73,70,70,1,0,0,0,87,69,66,80]);
const product=(id,name,imageUrl)=>({id,name,imageUrl,categoryId:'cat-drinks',prices:{Friedrichshafen:4,Bregenz:4},pfand:{Friedrichshafen:0,Bregenz:0},hasShot:false,taxClass:'standard',available:true,sortOrder:0});
const catalog={
  products:[
    product('p-rot','Glühwein Rot',base+'rot.png'),
    product('p-witwe','Heiße Witwe',base+'witwe.jpg'),
    product('p-aperol','Hot Aperol',base+'aperol.webp'),
    product('p-missing','Pfandglas',base+'missing.png'),
    product('p-foreign','Externer Artikel','https://example.invalid/a.png'),
    product('p-no-image','Ohne Bild',''),
  ],
  categories:[{id:'cat-drinks',name:'Getränke',color:'#ffffff',sortOrder:0,icon:'CupSoda'}],
  pfandSettings:{Friedrichshafen:3,Bregenz:3},
  shotOptions:[],
};
const responses=new Map([[base+'rot.png',imagePng],[base+'witwe.jpg',imageJpg],[base+'aperol.webp',imageWebp]]);
const requested=[];
const mockFetch=async(url,opts)=>{
  requested.push(url);
  assert.equal(opts.credentials,'omit');
  const bytes=responses.get(url);
  return bytes?
    {ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:
    {ok:false,status:404,headers:{get:()=>null}};
};
let n=0;
function check(name,fn){return Promise.resolve().then(fn).then(()=>{n++;console.log('BESTANDEN: '+name);});}
let archive;
await check('01 ZIP enthaelt die echten Bildbytes aus dem eigenen Storage',async()=>{
  archive=await buildCatalogImagesZip(catalog,origin,undefined,mockFetch);
  const zip=unzipSync(archive.bytes);
  assert.deepEqual(zip['Bilder/Glühwein Rot.png'],imagePng);
  assert.deepEqual(zip['Bilder/Heiße Witwe.jpg'],imageJpg);
  assert.deepEqual(zip['Bilder/Hot Aperol.webp'],imageWebp);
  assert.equal(archive.exportedImages,3);
});
await check('02 Fehlende und gesperrte Bilder werden im ZIP dokumentiert',()=>{
  const zip=unzipSync(archive.bytes);
  const missing=strFromU8(zip['FEHLENDE_BILDER.txt']);
  assert.match(missing,/Pfandglas/);
  assert.match(missing,/Externer Artikel/);
  assert.match(missing,/Ohne Bild/);
  assert.equal(archive.missingImages.length,3);
  assert(!requested.some(url=>url.includes('example.invalid')));
});
await check('03 ZIP Dateien sind vom vorhandenen Bilder-Import zuordenbar',()=>{
  const images=readImageZip(archive.bytes);
  assert.equal(images.length,3);
  assert(images.some(x=>x.path==='Bilder/Glühwein Rot.png'));
  const sheets={Artikel:[['Produktname App','VK','Warengruppe','Preis fix / individuell','Steuer DE in %','Steuer AT in %','Schuss','Pfand'],['Glühwein Rot',4,'Getränke','fix',19,20,'',''],['Heiße Witwe',4,'Getränke','fix',19,20,'',''],['Hot Aperol',4,'Getränke','fix',19,20,'','']]};
  const baseCatalog={...catalog,products:catalog.products.map(p=>({...p,imageUrl:''}))};
  const plan=buildImportPlan(sheets,baseCatalog,images,false);
  assert.equal(plan.errors.length,0,plan.errors.join('; '));
  assert.equal(Object.keys(plan.images).length,3);
  const existing=buildImportPlan(sheets,catalog,images,false);
  assert.equal(Object.keys(existing.images).length,0,'Bestehende Bilder nicht ohne Auswahl ersetzen');
});
await check('04 Excel+ZIP-Paket sichert trotz fehlendem Bild alle verfuegbaren',async()=>{
  const bundle=await buildCatalogBundle(catalog,undefined,origin,mockFetch);
  const outer=unzipSync(bundle.bytes);
  const inner=unzipSync(outer['WOODMO_Bilder.zip']);
  assert.equal(readImageZip(outer['WOODMO_Bilder.zip']).length,3);
  assert.match(strFromU8(inner['FEHLENDE_BILDER.txt']),/Pfandglas/);
  const workbook=await readWorkbook(outer['WOODMO_Katalog.xlsx']);
  assert(Object.keys(workbook).length>0);
});
await check('05 Bildarchiv enthaelt keine Zugangsdaten oder eingebettete Data-URLs',()=>{
  const listed=Object.keys(unzipSync(archive.bytes));
  assert(!listed.some(x=>/\.json$/i.test(x)));
  const text=strFromU8(unzipSync(archive.bytes)['FEHLENDE_BILDER.txt']);
  assert(!text.includes('data:image'));
});
console.log('WOODMO BILDER-ZIP: '+n+'/'+n+' Verhaltenstests bestanden');
