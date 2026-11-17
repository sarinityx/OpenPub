require(require('path').join(__dirname, '..', '..', 'app', 'src', 'cfb.js'));
const fs=require('fs');
const f=process.argv[2]; const what=process.argv[3]||'contents';
const c=OP.readCFB(new Uint8Array(fs.readFileSync(f)));
function R(b){this.b=b;this.dv=new DataView(b.buffer,b.byteOffset,b.byteLength);this.p=0;}
R.prototype={u8(){return this.b[this.p++]},u16(){const v=this.dv.getUint16(this.p,true);this.p+=2;return v},u32(){const v=this.dv.getUint32(this.p,true);this.p+=4;return v}};
function blen(t){switch(t){case 0x78:case 5:case 8:case 0xa:return 0;case 0x10:case 0x12:case 0x18:case 0x1a:case 7:return 2;case 0x20:case 0x22:case 0x58:case 0x68:case 0x70:case 0xb8:return 4;case 0x28:return 8;case 0x38:return 16;case 0x48:return 24;case 0xc0:case 0x80:case 0x82:case 0x88:case 0x8a:case 0x90:case 0x98:case 0xa0:return -1;}return -2;}
function dumpBlocks(r,end,ind,maxd){
  while(r.p<end && r.p<r.b.length-1){
    const st=r.p,id=r.u8(),t=r.u8();const l=blen(t);
    if(l===-2){console.log(ind+`@${st.toString(16)} id ${id.toString(16)} type ${t.toString(16)} UNKNOWN`);continue;}
    if(l===-1){const dl=r.u32();const dend=st+2+dl;
      if(t===0xc0){let s='';for(let i=r.p;i+1<dend;i+=2)s+=String.fromCharCode(r.dv.getUint16(i,true));console.log(ind+`@${st.toString(16)} id ${id.toString(16)} STR(${dl}) "${s.slice(0,60)}"`);}
      else{console.log(ind+`@${st.toString(16)} id ${id.toString(16)} type ${t.toString(16)} len ${dl}`);
        if(ind.length<maxd*2 && dl>4){ if(t===0x88||t===0x90||t===0xa0||t===0x8a||t===0x80||t===0x82||t===0x98) dumpBlocks(r,dend,ind+'  ',maxd);} }
      r.p=Math.max(dend,st+6);
    } else { let v=0; if(l===2)v=r.u16(); else if(l===4)v=r.u32(); else r.p+=l;
      console.log(ind+`@${st.toString(16)} id ${id.toString(16)} type ${t.toString(16)} = 0x${v.toString(16)} (${v|0})`); }
  }
}
if(what==='contents'){
  const b=c.get('Contents');const r=new R(b);
  console.log('header',Buffer.from(b.subarray(0,0x20)).toString('hex'));
  r.p=0x1a;const to=r.u32();r.p=to;const tl=r.u32();console.log('trailer @',to.toString(16),'len',tl);
  dumpBlocks(r,to+tl,'',+process.argv[4]||3);
} else if(what==='chunk'){
  const b=c.get('Contents');const r=new R(b);r.p=parseInt(process.argv[4],16);const l=r.u32();console.log('chunk len',l);dumpBlocks(r,r.p-4+l,'',+process.argv[5]||6);
} else if(what==='escher'){
  const b=c.get('Escher/EscherStm');const r=new R(b);
  const CONT={0xF000:1,0xF001:1,0xF002:1,0xF003:1,0xF004:1};
  function de(end,ind){while(r.p+8<=end){const st=r.p,vi=r.u16(),t=r.u16(),l=r.u32();
    const isC=(vi&0xf)===0xf;
    let extra='';
    if(!isC){extra=Buffer.from(b.subarray(r.p,Math.min(r.p+l,r.p+48))).toString('hex');}
    console.log(ind+`@${st.toString(16)} ${t.toString(16)} inst ${(vi>>4).toString(16)} ver ${vi&0xf} len ${l} ${extra}`);
    if(isC){de(r.p+l,ind+'  '); r.p=st+8+l; if(t===0xF000||t===0xF002){console.log(ind+'  tail',Buffer.from(b.subarray(r.p,r.p+4)).toString('hex'));r.p+=4;}} else r.p=st+8+l;}}
  de(b.length,'');
} else if(what==='quill'){
  const b=c.get('Quill/QuillSub/CONTENTS');console.log(Buffer.from(b.subarray(0,0x20)).toString('hex'));
  const r=new R(b);let off=0x18;const seen=new Set();
  while(off!==0xffffffff&&!seen.has(off)){seen.add(off);r.p=off+2;const n=r.u16();off=r.u32();
    for(let i=0;i<n;i++){const a=r.u16();let nm='';for(let k=0;k<4;k++)nm+=String.fromCharCode(r.u8());const id=r.u16();const x=r.u32();let n2='';for(let k=0;k<4;k++)n2+=String.fromCharCode(r.u8());const o=r.u32(),l=r.u32();
      console.log(a.toString(16),JSON.stringify(nm),id,x.toString(16),JSON.stringify(n2),'off',o.toString(16),'len',l, Buffer.from(b.subarray(o,o+Math.min(l,40))).toString('hex'));}}
}
