['cfb','util','model','geometry','wmf','emf','layout','flow','table','wordart','pub','pubconv'].forEach(m=>{try{require(require('path').join(__dirname, '..', '..', 'app', 'src') + '/'+m+'.js')}catch(e){console.log('load',m,e.message)}});
const fs=require('fs');
(async()=>{const o=await OP.parsePub(new Uint8Array(fs.readFileSync(process.argv[2])));
 Object.values(o.shapes).filter(s=>s.table).forEach(s=>console.log('table',JSON.stringify(s.table),'seq',s.seq));
 (function w(l){l.forEach(m=>{if(m.shape&&o.shapes[m.shape.seq]&&o.shapes[m.shape.seq].table)console.log('abs',JSON.stringify(m.shape.abs),'type',m.shape.type,'W',o.widthEmu,o.heightEmu, JSON.stringify(m.shape.anchor||null));if(m.group)w(m.group)})})(o.drawn);
 const r=OP.pubToDoc(o,'x');r.doc.pages.forEach((p,i)=>p.items.filter(it=>it.type==='table').forEach(it=>console.log('page',i+1,'table item',it.x.toFixed(1),it.y.toFixed(1),it.w.toFixed(1),it.h.toFixed(1),'rows',it.rows,'cols',it.cols,'docW',r.doc.w.toFixed(1))));
})();
