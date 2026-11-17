/* OpenPub – OLE2 / Compound File Binary reader (written from scratch, MS-CFB layout). */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  var ENDOFCHAIN = 0xFFFFFFFE, FREESECT = 0xFFFFFFFF, MAXREG = 0xFFFFFFFA;
  var SIG = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

  function isCFB(bytes) {
    if (!bytes || bytes.length < 512) return false;
    for (var i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) return false;
    return true;
  }

  /**
   * Parse a compound file.
   * @param {Uint8Array} bytes
   * @returns {{entries:Object[], get:function(string):Uint8Array|null, list:function():string[]}}
   */
  function readCFB(bytes) {
    if (!isCFB(bytes)) throw new Error('Not an OLE compound file (bad signature)');
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var u16 = function (o) { return dv.getUint16(o, true); };
    var u32 = function (o) { return dv.getUint32(o, true); };

    var sectorShift = u16(0x1E), miniShift = u16(0x20);
    if (sectorShift !== 9 && sectorShift !== 12) throw new Error('Unsupported sector size');
    var ss = 1 << sectorShift, mss = 1 << miniShift;
    var numFat = u32(0x2C), dirStart = u32(0x30), miniCutoff = u32(0x38);
    var miniFatStart = u32(0x3C), numMiniFat = u32(0x40);
    var difatStart = u32(0x44), numDifat = u32(0x48);
    var maxSectors = Math.floor(bytes.length / ss) + 1;

    function secOff(n) { return (n + 1) * ss; }

    // --- DIFAT -> list of FAT sectors
    var fatSectors = [], i, j;
    for (i = 0; i < 109 && fatSectors.length < numFat; i++) {
      var s = u32(0x4C + i * 4);
      if (s <= MAXREG) fatSectors.push(s);
    }
    var ds = difatStart, guard = 0;
    while (ds <= MAXREG && guard++ < numDifat + 8 && secOff(ds) + ss <= bytes.length) {
      var per = ss / 4 - 1;
      for (i = 0; i < per && fatSectors.length < numFat; i++) {
        var s2 = u32(secOff(ds) + i * 4);
        if (s2 <= MAXREG) fatSectors.push(s2);
      }
      ds = u32(secOff(ds) + per * 4);
    }

    // --- FAT
    var fat = new Uint32Array(fatSectors.length * (ss / 4));
    for (i = 0; i < fatSectors.length; i++) {
      var base = secOff(fatSectors[i]);
      if (base + ss > bytes.length) continue;
      for (j = 0; j < ss / 4; j++) fat[i * (ss / 4) + j] = u32(base + j * 4);
    }

    function chain(start) {
      var out = [], n = start, g = 0;
      while (n <= MAXREG && n < fat.length && g++ < maxSectors) { out.push(n); n = fat[n]; }
      return out;
    }

    function readChain(start, size) {
      var secs = chain(start);
      var total = secs.length * ss;
      if (size === undefined || size > total) size = total;
      var out = new Uint8Array(size), pos = 0;
      for (var k = 0; k < secs.length && pos < size; k++) {
        var off = secOff(secs[k]);
        var n = Math.min(ss, size - pos, Math.max(0, bytes.length - off));
        if (n <= 0) break;
        out.set(bytes.subarray(off, off + n), pos);
        pos += n;
      }
      return out;
    }

    // --- Directory
    var dirBytes = readChain(dirStart);
    var ddv = new DataView(dirBytes.buffer);
    var entries = [];
    for (i = 0; i + 128 <= dirBytes.length; i += 128) {
      var nameLen = ddv.getUint16(i + 0x40, true);
      var name = '';
      for (j = 0; j < Math.min(nameLen, 64) - 2; j += 2) name += String.fromCharCode(ddv.getUint16(i + j, true));
      entries.push({
        name: name,
        type: dirBytes[i + 0x42],
        left: ddv.getUint32(i + 0x44, true),
        right: ddv.getUint32(i + 0x48, true),
        child: ddv.getUint32(i + 0x4C, true),
        start: ddv.getUint32(i + 0x74, true),
        size: ddv.getUint32(i + 0x78, true),
        path: null
      });
    }
    if (!entries.length || entries[0].type !== 5) throw new Error('Compound file has no root entry');

    // --- Mini FAT + mini stream
    var miniFatBytes = numMiniFat ? readChain(miniFatStart) : new Uint8Array(0);
    var miniFat = new Uint32Array(Math.floor(miniFatBytes.length / 4));
    var mdv = new DataView(miniFatBytes.buffer);
    for (i = 0; i < miniFat.length; i++) miniFat[i] = mdv.getUint32(i * 4, true);
    var miniStream = readChain(entries[0].start, entries[0].size);

    function readMini(start, size) {
      if (size > miniStream.length) size = miniStream.length;
      var out = new Uint8Array(size), pos = 0, n = start, g = 0;
      while (n <= MAXREG && n < miniFat.length && pos < size && g++ < miniFat.length + 1) {
        var off = n * mss;
        var len = Math.min(mss, size - pos, Math.max(0, miniStream.length - off));
        if (len <= 0) break;
        out.set(miniStream.subarray(off, off + len), pos);
        pos += len;
        n = miniFat[n];
      }
      return out;
    }

    // --- Walk the tree to give every entry a path
    var byPath = {};
    function walk(idx, prefix, depth) {
      if (idx > MAXREG || idx >= entries.length || depth > 4096) return;
      var e = entries[idx];
      if (e.path !== null) return; // cycle guard
      e.path = prefix + e.name;
      byPath[e.path] = e;
      walk(e.left, prefix, depth + 1);
      walk(e.right, prefix, depth + 1);
      if (e.type === 1) walk(e.child, e.path + '/', depth + 1);
    }
    entries[0].path = '';
    walk(entries[0].child, '', 0);

    return {
      entries: entries,
      list: function () { return Object.keys(byPath); },
      has: function (path) { return !!byPath[path]; },
      get: function (path) {
        var e = byPath[path];
        if (!e || e.type !== 2) return null;
        return e.size < miniCutoff ? readMini(e.start, e.size) : readChain(e.start, e.size);
      }
    };
  }

  OP.isCFB = isCFB;
  OP.readCFB = readCFB;
})();
