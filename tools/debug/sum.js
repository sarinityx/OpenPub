['cfb','util','pub'].forEach(m=>require(require('path').join(__dirname, '..', '..', 'app', 'src') + '/'+m+'.js'));
const fs=require('fs');
(async()=>{for (const f of process.argv.slice(2)) {
  try {
    const o=await OP.parsePub(new Uint8Array(fs.readFileSync(f)));
    const pages=Object.values(o.pages);
    let nsh=0,ng=0; (function w(l){l.forEach(m=>{if(m.group){ng++;w(m.group)}else nsh++})})(o.drawn);
    console.log(f.split('/').pop(), `size ${o.widthEmu/12700}x${o.heightEmu/12700}pt pages ${pages.length} (order ${o.pageOrder.map(x=>x.toString(16))}) masters ${pages.filter(p=>p.isMaster).map(p=>p.seq.toString(16))} shapes(contents) ${Object.keys(o.shapes).length} escher shapes ${nsh} groups ${ng} stories ${o.storyOrder.length} fonts ${o.fonts.length} palette ${o.palette.length} textColors ${o.textColors.length} bse ${o.bse.length} imgs ${o.images.map(i=>i?i.kind+':'+i.bytes.length:'-')} warn ${JSON.stringify(o.warnings)}`);
    if(process.env.V){ for(const id of o.storyOrder){const s=o.stories[id]; console.log(' story',id,s.cellEnds?'cells':'' ,JSON.stringify(s.paras.map(p=>p.runs.map(r=>r.text).join('|'))).slice(0,300));}
      pages.forEach(p=>console.log(' page',p.seq.toString(16),'master?',p.isMaster,'applied',p.master&&p.master.toString(16),'bg',p.bgShape&&p.bgShape.toString(16),'shapes',p.shapes.map(x=>x.toString(16)).join(',')));
      console.log(' fonts',o.fonts.join(', ')); console.log(' defaultChar',JSON.stringify(o.defaultChar)); console.log(' defaultPara',JSON.stringify(o.defaultPara));}
  } catch(e){ console.log(f.split('/').pop(),'ERR',e.message); }
}})();
