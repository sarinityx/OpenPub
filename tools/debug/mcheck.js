['cfb','util','model','geometry','wmf','emf','layout','flow','table','wordart','pub','pubconv'].forEach(m=>require(require('path').join(__dirname, '..', '..', 'app', 'src') + '/'+m+'.js'));
const fs=require('fs');
(async()=>{for(const f of process.argv.slice(2)){try{const o=await OP.parsePub(new Uint8Array(fs.readFileSync(f)));const r=OP.pubToDoc(o,'x');
 console.log(f.split('/').pop(),'masters',r.doc.masters.map(m=>m.name+':'+m.items.length).join(',')||'-','pages using',r.doc.pages.filter(p=>p.master).length+'/'+r.doc.pages.length,'cols',r.doc.pages.reduce((n,p)=>n+p.items.filter(i=>i.text&&i.text.cols>1).length,0));}catch(e){console.log(f.split('/').pop(),'ERR',e.message)}}})();
