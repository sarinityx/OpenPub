['cfb','util','model','geometry','pub','pubconv'].forEach(m=>require(require('path').join(__dirname, '..', '..', 'app', 'src') + '/'+m+'.js'));
const fs=require('fs');
(async()=>{for (const f of process.argv.slice(2)) {
  try {
    const o=await OP.parsePub(new Uint8Array(fs.readFileSync(f)));
    const {doc,notes,itemCount}=OP.pubToDoc(o,f.split('/').pop());
    console.log('==',doc.name, OP.round(doc.w/OP.MM,1)+'x'+OP.round(doc.h/OP.MM,1)+'mm', 'pages',doc.pages.length,'items',itemCount,'assets',Object.keys(doc.assets).length);
    notes.forEach(n=>console.log('   note:',n));
    if(process.env.V) doc.pages.forEach((p,i)=>{console.log(' page',i+1,'bg',p.bg); p.items.forEach(it=>console.log('   ',it.type,it.kind||'',`[${OP.round(it.x,0)},${OP.round(it.y,0)} ${OP.round(it.w,0)}x${OP.round(it.h,0)} r${it.rot}]`,it.group?'g':'', 'fill',JSON.stringify(it.fill||null).slice(0,60),'stroke',JSON.stringify(it.stroke||null), it.text?JSON.stringify(OP.plainText(it.text)).slice(0,50)+' '+it.text.paras[0].runs[0].font+' '+it.text.paras[0].runs[0].size:''));});
  } catch(e){ console.log(f.split('/').pop(),'ERR',e.stack); }
}})();
