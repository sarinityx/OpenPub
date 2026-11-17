// Rewrites pure RGB black (0 0 0 rg / RG) in a PDF's content streams as grey black (0 g / G).
// Ghostscript maps grey to the black plate only, so black text and rules stay single-colour black
// after CMYK conversion instead of becoming four-colour "rich" black.
// Written for the simple PDFs Chromium produces (classic cross-reference table, direct /Length).
// Anything unexpected returns the input untouched.
'use strict';
const zlib = require('zlib');

function pureBlackToGray(buf) {
  try {
    const s = buf.toString('latin1');
    const first = s.search(/\d+ 0 obj\b/);
    const xrefAt = s.lastIndexOf('\nxref');
    const trailerAt = s.lastIndexOf('trailer');
    const startxrefAt = s.lastIndexOf('startxref');
    if (first < 0 || xrefAt < 0 || trailerAt < xrefAt || startxrefAt < trailerAt) return buf;
    const head = s.slice(0, first);
    const trailer = s.slice(trailerAt, startxrefAt);
    const objs = [];
    let pos = first, changed = 0;
    const header = /(\d+) 0 obj\s/y;
    while (pos < xrefAt) {
      header.lastIndex = pos;
      const m = header.exec(s);
      if (!m) { // whitespace between objects
        if (/\s/.test(s.charAt(pos))) { pos++; continue; }
        return buf;
      }
      const bodyStart = header.lastIndex;
      const endObj = s.indexOf('endobj', bodyStart), streamKw = s.indexOf('stream', bodyStart);
      if (endObj < 0) return buf;
      if (streamKw >= 0 && streamKw < endObj && /\/Length\b/.test(s.slice(bodyStart, streamKw))) {
        const dict = s.slice(bodyStart, streamKw);
        const lm = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
        if (!lm) return buf; // indirect length: not a file we understand
        let dataStart = streamKw + 6;
        if (s.charAt(dataStart) === '\r') dataStart++;
        if (s.charAt(dataStart) === '\n') dataStart++;
        const len = +lm[1], dataEnd = dataStart + len;
        const after = s.indexOf('endobj', dataEnd);
        if (after < 0 || s.slice(dataEnd, after).replace(/\s/g, '') !== 'endstream') return buf;
        let data = buf.subarray(dataStart, dataEnd), newDict = dict;
        const isContent = /\/Filter\s*\/FlateDecode/.test(dict) && !/\/Subtype\s*\/Image/.test(dict) && !/\/Length1\b/.test(dict) && !/\/Type\s*\/(XRef|ObjStm|Metadata|EmbeddedFile)/.test(dict) && !/\/FunctionType/.test(dict);
        if (isContent) {
          let text = null;
          try { text = zlib.inflateSync(data).toString('latin1'); } catch (e) { text = null; }
          if (text !== null && /\s(rg|RG)\s/.test(text)) {
            const out = text.replace(/(^|\s)0(?:\.0+)? 0(?:\.0+)? 0(?:\.0+)? rg(?=\s)/g, '$10 g').replace(/(^|\s)0(?:\.0+)? 0(?:\.0+)? 0(?:\.0+)? RG(?=\s)/g, '$10 G');
            if (out !== text) {
              data = zlib.deflateSync(Buffer.from(out, 'latin1'));
              newDict = dict.replace(/\/Length\s+\d+/, '/Length ' + data.length);
              changed++;
            }
          }
        }
        objs.push({ num: +m[1], dict: newDict, data: data });
        pos = after + 6;
      } else {
        objs.push({ num: +m[1], dict: s.slice(bodyStart, endObj), data: null });
        pos = endObj + 6;
      }
    }
    if (!changed) return buf;
    const parts = [Buffer.from(head, 'latin1')];
    let offset = parts[0].length, maxNum = 0;
    const offsets = {};
    objs.forEach((o) => {
      offsets[o.num] = offset; if (o.num > maxNum) maxNum = o.num;
      const chunks = [Buffer.from(o.num + ' 0 obj\n' + o.dict, 'latin1')];
      if (o.data) chunks.push(Buffer.from('stream\n', 'latin1'), o.data, Buffer.from('\nendstream\n', 'latin1'));
      chunks.push(Buffer.from('endobj\n', 'latin1'));
      chunks.forEach((c) => { parts.push(c); offset += c.length; });
    });
    let xref = 'xref\n0 ' + (maxNum + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= maxNum; i++) xref += (offsets[i] !== undefined ? String(offsets[i]).padStart(10, '0') + ' 00000 n \n' : '0000000000 65535 f \n');
    parts.push(Buffer.from(xref + trailer + 'startxref\n' + offset + '\n%%EOF\n', 'latin1'));
    return Buffer.concat(parts);
  } catch (e) {
    return buf;
  }
}

module.exports = { pureBlackToGray };
