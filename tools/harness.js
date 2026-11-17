// Renders .pub files through the app's own parser + renderer in headless Chrome.
const fs=require('fs'), path=require('path');
const lib = require('./lib');
const SRC=lib.SRC+path.sep;
const mods=(process.env.MODS||'cfb,util,model,geometry,wmf,emf,layout,hyph,flow,wrap,table,wordart,pub,pubconv,render,export').split(',').filter(m=>fs.existsSync(SRC+m+'.js'));
const html='<!DOCTYPE html><html><body><script>'+mods.map(m=>fs.readFileSync(SRC+m+'.js','utf8')).join('\n;\n')+'</script></body></html>';
(async()=>{
  const browser=await lib.launchChrome();
  const page=await browser.newPage();
  page.on('console',m=>console.log('[page]',m.text())); page.on('pageerror',e=>console.log('[pageerror]',e.message));
  await page.setContent(html);
  // usage: node tools/harness.js [outDir file.pub ...]   (no arguments: every sample in test-data/publisher)
  const outDir=process.argv[2]||lib.outDir('parser'); fs.mkdirSync(outDir,{recursive:true});
  const files=process.argv.length>3?process.argv.slice(3):fs.readdirSync(lib.PUBS).filter(f=>/\.pub$/.test(f)&&!/^clusterfuzz/.test(f)).sort().map(f=>path.join(lib.PUBS,f));
  for(const f of files){
   try{
    const b64=fs.readFileSync(f).toString('base64');
    const res=await page.evaluate(async({b64,name})=>{
      const bin=atob(b64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
      const pub=await OP.parsePub(bytes);
      const r=OP.pubToDoc(pub,name,{flow:true});
      await OP.ensureImages(r.doc);
      const out=[];
      for(const pg of r.doc.pages){ out.push(OP.pageToCanvas(r.doc,pg,1.5).toDataURL('image/png')); }
      return {pages:out,notes:r.notes};
    },{b64,name:path.basename(f)});
    console.log(path.basename(f),'pages',res.pages.length,'notes',JSON.stringify(res.notes));
    res.pages.forEach((d,i)=>fs.writeFileSync(path.join(outDir,path.basename(f,'.pub')+'-'+(i+1)+'.png'),Buffer.from(d.split(',')[1],'base64')));
   }catch(e){ console.log(path.basename(f),'NOT OPENED:',String(e.message).split('\n')[0].slice(0,160)); }
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
