['cfb','util','model','geometry','pub'].forEach(m=>require(require('path').join(__dirname, '..', '..', 'app', 'src') + '/'+m+'.js'));
const fs=require('fs');
(async()=>{for(const f of process.argv.slice(2)){try{const o=await OP.parsePub(new Uint8Array(fs.readFileSync(f)));
 const k={};(o.images||[]).forEach(i=>{if(i)k[i.kind]=(k[i.kind]||0)+1});
 const tabs=Object.values(o.shapes).filter(s=>s.table).length;
 const cols=[];(function w(l){l.forEach(m=>{if(m.shape&&m.shape.tert&&m.shape.tert.v[0x8C]>1)cols.push(m.shape.tert.v[0x8C]);if(m.shape&&m.shape.type>=136&&m.shape.type<=175)cols.push('WA'+m.shape.type);if(m.group)w(m.group)})})(o.drawn);
 const fc={};Object.values(o.shapes).forEach(s=>{if(s.textId!=null)fc[s.textId]=(fc[s.textId]||0)+1});
 console.log(f.split('/').pop(),JSON.stringify(k),'tables',tabs,'cols/wa',cols.join(','),'linked stories',Object.values(fc).filter(n=>n>1).length,'masters',Object.values(o.pages).filter(p=>p.isMaster).length);}catch(e){console.log(f.split('/').pop(),'ERR',e.message)}}})();
