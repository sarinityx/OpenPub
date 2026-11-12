// Renders .pub files through the app's own parser + renderer in headless Chrome.
const fs=require('fs'), path=require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const SRC='/home/claude/app/src/';
const mods=(process.env.MODS||'cfb,util,model,geometry,wmf,emf,layout,hyph,flow,wrap,table,wordart,pub,pubconv,render,export').split(',').filter(m=>fs.existsSync(SRC+m+'.js'));
const html='<!DOCTYPE html><html><body><script>'+mods.map(m=>fs.readFileSync(SRC+m+'.js','utf8')).join('\n;\n')+'</script></body></html>';
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
  const page=await browser.newPage();
  page.on('console',m=>console.log('[page]',m.text())); page.on('pageerror',e=>console.log('[pageerror]',e.message));
  await page.setContent(html);
  const outDir=process.argv[2];
  for(const f of process.argv.slice(3)){
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
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
