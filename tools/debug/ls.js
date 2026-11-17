require(require('path').join(__dirname, '..', '..', 'app', 'src', 'cfb.js'));
const fs=require('fs');
for (const f of process.argv.slice(2)) {
  try {
    const c=OP.readCFB(new Uint8Array(fs.readFileSync(f)));
    console.log(f.split('/').pop(), c.list().map(p=>p+':'+(c.get(p)?c.get(p).length:'dir')).join('  '));
  } catch(e){ console.log(f.split('/').pop(),'ERR',e.message); }
}
