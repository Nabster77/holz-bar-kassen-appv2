/** Free, offline, deterministic product illustrations. No external AI or API. */
export async function createCatalogIllustration(name: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser unterstützt keine Bildillustrationen.');
  const lower = name.toLocaleLowerCase('de-DE');
  const wine = /glühwein|wein|punsch|most|sekt|likör|schnaps|zirbe|obstler|mirabelle|williams/.test(lower);
  const coffee = /kaffee|kafee|tee|kakao|schokolade/.test(lower);
  const red = /rot|kirsch|beere|erdbeer/.test(lower);
  const rose = /rosé|rose|pink|himbeer/.test(lower);
  const white = /weiß|weiss|apfel|birne/.test(lower);
  const liquid = rose ? '#db7c9b' : white ? '#e8b955' : red || /glühwein/.test(lower) ? '#a63848' : '#bc864e';
  const bg = ctx.createLinearGradient(0,0,512,512);
  bg.addColorStop(0,'#fff5e4'); bg.addColorStop(1,'#ead8bf');
  ctx.fillStyle=bg; ctx.fillRect(0,0,512,512);
  // Soft tabletop and product shadow.
  ctx.fillStyle='#d4bea3'; ctx.fillRect(0,410,512,102);
  ctx.fillStyle='rgba(65,44,29,.14)';ctx.beginPath();ctx.ellipse(256,411,148,22,0,0,Math.PI*2);ctx.fill();
  const rounded = (x:number,y:number,w:number,h:number,r:number) => {
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  };
  if (wine || coffee) {
    // A generic warm drink in a handled glass, suitable for mulled wine variants.
    ctx.strokeStyle='#947f6c';ctx.lineWidth=17;ctx.beginPath();ctx.ellipse(368,291,55,66,0,-Math.PI/2,Math.PI/2);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.85)';rounded(143,169,214,224,31);ctx.fill();
    ctx.fillStyle=coffee?'#78513c':liquid;rounded(157,219,186,157,19);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.22)';rounded(173,236,23,114,11);ctx.fill();
    ctx.strokeStyle='#fffaf0';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(167,169);ctx.lineTo(333,169);ctx.stroke();
    // Steam curls.
    ctx.strokeStyle='rgba(133,105,85,.50)';ctx.lineWidth=8;ctx.lineCap='round';
    for (const x of [204,255,306]) {ctx.beginPath();ctx.moveTo(x,140);ctx.bezierCurveTo(x-27,113,x+22,91,x,65);ctx.stroke();}
    if (!coffee) {
      ctx.fillStyle='#f6ba57';ctx.beginPath();ctx.arc(289,262,26,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=liquid;ctx.beginPath();ctx.arc(289,262,18,0,Math.PI*2);ctx.fill();
    }
  } else {
    // Neutral crafted-goods illustration, not a misleading product photograph.
    ctx.fillStyle='#b9875d';rounded(155,128,202,272,26);ctx.fill();
    ctx.fillStyle='#d6aa7c';rounded(175,150,162,226,16);ctx.fill();
    ctx.strokeStyle='#8a6347';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(189,206);ctx.bezierCurveTo(250,177,273,245,323,202);ctx.stroke();
    ctx.beginPath();ctx.moveTo(189,296);ctx.bezierCurveTo(250,267,273,335,323,292);ctx.stroke();
    ctx.fillStyle='#f2e3c9';ctx.beginPath();ctx.arc(256,254,33,0,Math.PI*2);ctx.fill();
  }
  return await new Promise<File>((resolve,reject)=>canvas.toBlob(blob => blob ? resolve(new File([blob],'woodmo-illustration.png',{type:'image/png'})) : reject(new Error('Illustration konnte nicht erstellt werden.')),'image/png'));
}
