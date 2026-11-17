/* OpenPub – Microsoft Publisher (.pub) reader, written from scratch.
 *
 * Microsoft never published the .pub format. The layout knowledge used here comes from the
 * public reverse-engineering work of the Document Liberation Project (libmspub) and Apache POI
 * (HPBF). No code from either project is included; this is an independent implementation.
 *
 * Supported: Publisher 2002 – 2021 files ("Contents" + "Escher" + "Quill" streams).
 * Not supported: Publisher 2000 and older (different binary layout).
 */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  var EMU_PER_PT = 12700;

  // ---------------------------------------------------------------- byte reader
  function Reader(bytes) {
    this.b = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
    this.n = bytes.length;
  }
  Reader.prototype.u8 = function () { return this.p < this.n ? this.b[this.p++] : (this.p++, 0); };
  Reader.prototype.u16 = function () { var v = this.p + 2 <= this.n ? this.dv.getUint16(this.p, true) : 0; this.p += 2; return v; };
  Reader.prototype.u32 = function () { var v = this.p + 4 <= this.n ? this.dv.getUint32(this.p, true) : 0; this.p += 4; return v; };
  Reader.prototype.i32 = function () { var v = this.p + 4 <= this.n ? this.dv.getInt32(this.p, true) : 0; this.p += 4; return v; };
  Reader.prototype.i16 = function () { var v = this.p + 2 <= this.n ? this.dv.getInt16(this.p, true) : 0; this.p += 2; return v; };
  Reader.prototype.utf16 = function (from, to) {
    var s = '';
    to = Math.min(to, this.n);
    for (var i = from; i + 1 < to; i += 2) s += String.fromCharCode(this.dv.getUint16(i, true));
    return s;
  };

  // ---------------------------------------------------------------- "block" records (Contents + Quill)
  // Every record is: id (1 byte), type (1 byte), then data whose length depends on the type.
  function blockDataLength(type) {
    switch (type) {
      case 0x78: case 0x05: case 0x08: case 0x0a: return 0;
      case 0x10: case 0x12: case 0x18: case 0x1a: case 0x07: return 2;
      case 0x20: case 0x22: case 0x58: case 0x68: case 0x70: case 0xb8: return 4;
      case 0x28: return 8;
      case 0x38: return 16;
      case 0x48: return 24;
      case 0xc0: case 0x80: case 0x82: case 0x88: case 0x8a: case 0x90: case 0x98: case 0xa0: return -1;
    }
    return 0;
  }

  /** Read one block. For containers the reader is left at the first child unless `skip` is true. */
  function readBlock(r, skip) {
    var b = { start: r.p, id: r.u8(), type: r.u8(), dataOffset: 0, dataLength: 0, data: 0, str: null, end: 0 };
    b.dataOffset = r.p;
    var len = blockDataLength(b.type);
    if (len < 0) {
      b.dataLength = r.u32();
      if (b.dataLength < 4) b.dataLength = 4;
      b.end = b.dataOffset + b.dataLength;
      if (b.type === 0xc0) {
        b.str = r.utf16(b.dataOffset + 4, b.end);
        r.p = b.end;
      } else if (skip) {
        r.p = b.end;
      }
    } else {
      b.dataLength = len;
      b.end = b.dataOffset + len;
      if (len === 2) b.data = r.u16();
      else if (len === 4) b.data = r.u32();
      else r.p = b.end;
    }
    return b;
  }

  /** Iterate the direct children of a region [from, to). */
  function eachBlock(r, from, to, fn) {
    r.p = from;
    to = Math.min(to, r.n);
    var guard = 0;
    while (r.p + 2 <= to && guard++ < 200000) {
      var b = readBlock(r, true);
      var next = Math.max(b.end, b.start + 2);
      if (fn(b) === false) return;
      r.p = next;
    }
  }
  /** Children of a container block (its first 4 data bytes are the length). */
  function eachChild(r, block, fn) { eachBlock(r, block.dataOffset + 4, block.end, fn); }

  // ---------------------------------------------------------------- colours
  function rgbOf(c) { return { r: c & 0xFF, g: (c >>> 8) & 0xFF, b: (c >>> 16) & 0xFF }; }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function toHex(c) { return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b); }

  /** Resolve an Office colour reference (scheme index / tint / shade / plain BGR). */
  function resolveColor(ref, palette, baseRef) {
    ref = ref >>> 0;
    var type = (ref >>> 24) & 0xFF;
    function real(c) {
      c = c >>> 0;
      if (((c >>> 24) & 0xFF) === 0x08) {
        var idx = c & 0xFFFFFF;
        return palette[idx] || { r: 0, g: 0, b: 0 };
      }
      return rgbOf(c);
    }
    if (type === 0x10) { // "change intensity" of the base colour
      var base = real(baseRef === undefined ? ref : baseRef);
      var mode = (ref >>> 8) & 0xFF;
      var k = ((ref >>> 16) & 0xFF) / 255;
      if (mode === 1) return { r: base.r * k, g: base.g * k, b: base.b * k };
      if (mode === 2) return { r: base.r + (255 - base.r) * (1 - k), g: base.g + (255 - base.g) * (1 - k), b: base.b + (255 - base.b) * (1 - k) };
      return { r: 0, g: 0, b: 0 };
    }
    return real(ref);
  }

  // ---------------------------------------------------------------- Quill (text) stream
  function parseCharStyle(r) {
    var st = {};
    var off = r.p, len = r.u32();
    eachBlock(r, off + 4, off + len, function (b) {
      switch (b.id) {
        case 0x02: st.bold = true; break;
        case 0x03: st.italic = true; break;
        case 0x1E: st.underline = (b.data & 0xff) !== 0; break;
        case 0x0C: st.size = b.data / EMU_PER_PT; break;
        case 0x2E: st.colorIndex = b.data; break;
        case 0x44: // colour index container
          eachChild(r, b, function (s) { if (s.id === 0x00 && st.colorIndex === undefined) st.colorIndex = s.data; });
          break;
        case 0x24: // font index container
          eachChild(r, b, function (s) {
            if (s.type === 0x88 && st.fontIndex === undefined) {
              eachChild(r, s, function (ss) { st.fontIndex = ss.data; return false; });
            }
          });
          break;
        case 0x0F: st.superSub = b.data; break;
        case 0x13: st.smallCaps = true; break;
        case 0x14: st.allCaps = true; break;
      }
    });
    return st;
  }

  function parseParaStyle(r) {
    var st = {};
    var off = r.p, len = r.u32();
    eachBlock(r, off + 4, off + len, function (b) {
      switch (b.id) {
        case 0x04: st.align = b.data & 0xff; break;
        case 0x19: st.defaultIndex = b.data; break;
        case 0x34:
          if (b.data & 1) st.lsPt = (b.data - 1) / 8 * 72 / 914400;
          else if (b.data & 2) st.ls = (b.data - 2) / 914400 * 72 / 96;
          break;
        case 0x12: st.before = b.data / EMU_PER_PT; break;
        case 0x13: st.after = b.data / EMU_PER_PT; break;
        case 0x0C: st.indent = (b.data | 0) / EMU_PER_PT; break;
        // indents are signed: a negative left indent pulls text into the box's margin
        case 0x0D: st.left = (b.data | 0) / EMU_PER_PT; break;
        case 0x0E: st.right = (b.data | 0) / EMU_PER_PT; break;
        case 0x57: st.list = true; break;
      }
    });
    return st;
  }

  function parseQuill(bytes, out, warn) {
    var r = new Reader(bytes);
    // chunk directory (linked list of tables starting at 0x18)
    var chunks = [], listOff = 0x18, seen = {};
    while (listOff !== 0xffffffff && !seen[listOff] && listOff + 8 <= r.n) {
      seen[listOff] = true;
      r.p = listOff + 2;
      var num = r.u16();
      listOff = r.u32();
      for (var i = 0; i < num && r.p + 24 <= r.n; i++) {
        r.u16();
        var name = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
        var id = r.u16();
        r.p += 4;
        r.p += 4; // second name
        var offset = r.u32(), length = r.u32();
        chunks.push({ name: name, id: id, offset: offset, length: length });
      }
    }

    var text = null, textLengths = [], textIds = [], spans = [], paras = [];
    var stshCount = 0, cellEnds = {};
    out.fonts = []; out.textColors = []; out.defaultChar = []; out.defaultPara = [];

    chunks.forEach(function (c) {
      var k, n;
      r.p = c.offset;
      if (c.name === 'TEXT') {
        text = c;
      } else if (c.name === 'STRS') {
        n = r.u32();
        r.p = 4 + c.offset + r.u32();
        for (k = 0; k < n && r.p + 4 <= r.n; k++) textLengths.push(r.u32());
      } else if (c.name === 'SYID') {
        r.u32();
        n = r.u32();
        for (k = 0; k < n && r.p + 4 <= r.n; k++) textIds.push(r.u32());
      } else if (c.name === 'PL  ') {
        n = r.u32();
        r.p += 8;
        for (k = 0; k < n && r.p + 4 <= r.n; k++) {
          var bo = r.p, bl = r.u32();
          if (bl < 4) break;
          var found = null;
          eachBlock(r, bo + 4, bo + bl, function (b) { if (b.id === 0x01) found = b.data; });
          out.textColors.push(found === null ? 0 : found);
          r.p = bo + bl;
        }
      } else if (c.name === 'FDPC' || c.name === 'FDPP') {
        n = r.u16();
        r.p += 6;
        var ends = [], offs = [];
        for (k = 0; k < n; k++) ends.push(r.u32());
        for (k = 0; k < n; k++) offs.push(r.u16());
        for (k = 0; k < n; k++) {
          r.p = c.offset + offs[k];
          if (r.p + 4 > r.n) continue;
          if (c.name === 'FDPC') spans.push({ end: ends[k], style: parseCharStyle(r) });
          else paras.push({ end: ends[k], style: parseParaStyle(r) });
        }
      } else if (c.name === 'STSH') {
        if (stshCount++ === 1) {
          r.u32();
          n = Math.min(r.u32(), 4096);
          r.p += 12;
          var so = [];
          for (k = 0; k < n; k++) so.push(r.u32());
          for (k = 0; k < n; k++) {
            r.p = c.offset + 20 + so[k];
            if (r.p + 6 > r.n) continue;
            r.u16();
            if (k % 2 === 0) out.defaultChar.push(parseCharStyle(r));
            else out.defaultPara.push(parseParaStyle(r));
          }
        }
      } else if (c.name === 'FONT') {
        r.u32();
        n = Math.min(r.u32(), 4096);
        r.p += 12 + 4 * n;
        for (k = 0; k < n && r.p + 2 <= r.n; k++) {
          var nl = r.u16();
          if (nl > 0) {
            out.fonts.push(r.utf16(r.p, r.p + nl * 2).replace(/\0+$/, ''));
            r.p += nl * 2;
          }
          r.u32();
        }
      } else if (c.name === 'TCD ') {
        n = r.u32() + 1;
        r.p = c.offset + 0xC;
        var e = [];
        for (k = 0; k < n && k < 100000 && r.p + 4 <= r.n; k++) e.push(r.u32() + (k !== n - 1 ? 2 : 0));
        cellEnds[c.id] = e;
      }
    });

    out.stories = {};
    out.storyOrder = [];
    if (!text) { warn('No text chunk found in the Quill stream.'); return; }

    // Slice the text into stories -> paragraphs -> spans. Span/paragraph ends are byte offsets
    // within the Quill stream, so they are compared relative to the TEXT chunk start.
    var si = 0, pi = 0, pos = 0; // pos = chars consumed
    for (var j = 0; j < textIds.length && j < textLengths.length; j++) {
      var story = { id: textIds[j], paras: [], cellEnds: cellEnds[j] || null, used: false };
      var curRuns = [], cur = '';
      var flushRun = function () {
        if (cur.length) curRuns.push({ text: cur, style: si < spans.length ? spans[si].style : {} });
        cur = '';
      };
      var flushPara = function () {
        flushRun();
        if (curRuns.length) story.paras.push({ runs: curRuns, style: pi < paras.length ? paras[pi].style : {} });
        curRuns = [];
      };
      for (var k2 = 0; k2 < textLengths[j]; k2++) {
        var at = text.offset + pos * 2;
        if (at + 2 > r.n) break;
        cur += String.fromCharCode(r.dv.getUint16(at, true));
        pos++;
        var bytePos = pos * 2;
        if (si < spans.length && bytePos >= spans[si].end - text.offset) { flushRun(); si++; }
        if (pi < paras.length && bytePos >= paras[pi].end - text.offset) { flushPara(); pi++; }
      }
      flushPara();
      out.stories[story.id] = story;
      out.storyOrder.push(story.id);
    }
  }

  // ---------------------------------------------------------------- Contents stream
  var CHUNK_SHAPE = 0x01, CHUNK_ALTSHAPE = 0x20, CHUNK_DOCUMENT = 0x44, CHUNK_PAGE = 0x43, CHUNK_PALETTE = 0x5C,
    CHUNK_GROUP = 0x30, CHUNK_LOGO = 0x31, CHUNK_TABLE = 0x10, CHUNK_CELLS = 0x63;

  function parseContents(bytes, out, warn) {
    var r = new Reader(bytes);
    r.p = 0x1a;
    var trailerOffset = r.u32();
    if (trailerOffset + 4 > r.n) throw new Error('Contents stream trailer is out of range');
    r.p = trailerOffset;
    var trailerLength = r.u32();
    var chunks = [];
    eachBlock(r, trailerOffset + 4, trailerOffset + trailerLength, function (top) {
      if (top.type !== 0x90) return;
      var seq = 0;
      eachChild(r, top, function (b) {
        var mySeq = seq++;
        if (b.type !== 0x88) return;
        var c = { seq: mySeq, type: null, offset: null, parent: 0 };
        eachChild(r, b, function (s) {
          if (s.id === 0x02) c.type = s.data;
          else if (s.id === 0x04) c.offset = s.data;
          else if (s.id === 0x05) c.parent = s.data;
        });
        if (c.type !== null && c.offset !== null) chunks.push(c);
      });
    });

    out.palette = [];
    out.shapes = {};
    out.pages = {};
    out.pageOrder = [];
    out.widthEmu = 0; out.heightEmu = 0;
    var cellChunks = {};
    chunks.forEach(function (c) { if (c.type === CHUNK_CELLS) cellChunks[c.seq] = c; });

    function chunkBody(c, fn) {
      if (c.offset + 4 > r.n) return;
      r.p = c.offset;
      var len = r.u32();
      eachBlock(r, c.offset + 4, c.offset + len, fn);
    }

    chunks.forEach(function (c) {
      try {
        if (c.type === CHUNK_PALETTE) {
          chunkBody(c, function (b) {
            if (b.type !== 0xA0) return;
            eachChild(r, b, function (e) {
              if (e.type === 0x88) {
                var col = null;
                eachChild(r, e, function (s) { if (s.id === 0x01) col = rgbOf(s.data); });
                out.palette.push(col || { r: 0, g: 0, b: 0 });
              } else if (e.type === 0x78) {
                out.palette.push({ r: 0, g: 0, b: 0 });
              }
            });
          });
        } else if (c.type === CHUNK_DOCUMENT) {
          chunkBody(c, function (b) {
            if (b.id === 0x12 && b.type === 0x88) {
              eachChild(r, b, function (s) {
                if (s.id === 0x01) out.widthEmu = s.data;
                else if (s.id === 0x02) out.heightEmu = s.data;
              });
            } else if (b.id === 0x02 && b.type !== 0x20) {
              eachChild(r, b, function (s) { if (s.id === 0) out.pageOrder.push(s.data); });
            }
          });
        } else if (c.type === CHUNK_PAGE) {
          var pg = { seq: c.seq, shapes: [], bgShape: null, isMaster: false, master: null,
            dummy: false };
          chunkBody(c, function (b) {
            if (b.id === 0x0a) pg.bgShape = b.data;
            else if (b.id === 0x02 && blockDataLength(b.type) < 0) {
              eachChild(r, b, function (s) { if (s.type === 0x70) pg.shapes.push(s.data); });
            } else if (b.id === 0x0E && b.str !== null) {
              if (b.str.replace(/\0/g, '').length) pg.isMaster = true;
            } else if (b.id === 0x0D) pg.master = b.data;
          });
          // Publisher keeps a few hidden, empty scratch pages at fixed slots.
          pg.dummy = !pg.shapes.length && [0x10d, 0x110, 0x111, 0x113, 0x115, 0x117].indexOf(c.seq) >= 0;
          out.pages[c.seq] = pg;
        } else if (c.type === CHUNK_SHAPE || c.type === CHUNK_ALTSHAPE || c.type === CHUNK_GROUP ||
                   c.type === CHUNK_LOGO || c.type === CHUNK_TABLE) {
          var sh = { seq: c.seq, chunkType: c.type, parent: c.parent, textId: null, valign: null, table: null, borderArt: 0 };
          var rowcol = null, cellsSeq = null;
          chunkBody(c, function (b) {
            if (b.id === 0x27) sh.textId = b.data;
            else if (b.id === 0x35) sh.valign = b.data;
            else if (b.id === 0x09 && b.type === 0x18 && c.type === CHUNK_SHAPE) sh.borderArt = b.data; // Publisher's BorderArt pattern number
            // linked text boxes: place in the chain, previous and next box (shape seq)
            else if (b.id === 0x28 && b.type === 0x20) sh.chainIndex = b.data;
            else if (b.id === 0x36 && b.type === 0x68) sh.prevBox = b.data;
            else if (b.id === 0x37 && b.type === 0x68) sh.nextBox = b.data;
            else if (c.type === CHUNK_TABLE) {
              if (b.id === 0x6B) cellsSeq = b.data;
              else if (b.id === 0x66) { sh.table = sh.table || {}; sh.table.rows = b.data; }
              else if (b.id === 0x67) { sh.table = sh.table || {}; sh.table.cols = b.data; }
              else if (b.id === 0x6D) rowcol = b;
            }
          });
          if (c.type === CHUNK_TABLE && sh.table && rowcol && sh.table.rows < 1000 && sh.table.cols < 1000) {
            var t = sh.table;
            t.colW = []; t.rowH = []; t.cells = [];
            eachChild(r, rowcol, function (e) {
              if (e.id !== 0) return;
              eachChild(r, e, function (s) {
                if (s.id !== 0x02) return;
                if (t.colW.length < t.cols) t.colW.push(s.data);
                else if (t.rowH.length < t.rows) t.rowH.push(s.data);
              });
            });
            var cc = cellChunks[cellsSeq];
            if (cc) {
              chunkBody(cc, function (b) {
                if (b.id !== 0x02) return;
                eachChild(r, b, function (item) {
                  if (item.id !== 0) return;
                  var cell = { r0: 0, r1: 0, c0: 0, c1: 0 };
                  eachChild(r, item, function (s) {
                    if (s.id === 1) cell.r0 = s.data; else if (s.id === 2) cell.r1 = s.data;
                    else if (s.id === 3) cell.c0 = s.data; else if (s.id === 4) cell.c1 = s.data;
                  });
                  t.cells.push(cell);
                });
              });
            }
            if (t.colW.length !== t.cols || t.rowH.length !== t.rows) sh.table = null;
          } else if (c.type === CHUNK_TABLE) {
            sh.table = null;
          }
          out.shapes[c.seq] = sh;
        }
      } catch (e) {
        warn('Skipped a damaged chunk (type 0x' + c.type.toString(16) + '): ' + e.message);
      }
    });
    if (!out.widthEmu || !out.heightEmu) warn('Page size not found; defaulting to A4.');
  }

  // ---------------------------------------------------------------- Escher (drawing) stream
  var E_DGG = 0xF000, E_BSTORE = 0xF001, E_DG = 0xF002, E_SPGR = 0xF003, E_SP = 0xF004,
    E_FSPGR = 0xF009, E_FSP = 0xF00A, E_FOPT = 0xF00B, E_CHILD_ANCHOR = 0xF00F,
    E_CLIENT_ANCHOR = 0xF010, E_CLIENT_DATA = 0xF011, E_TERTIARY = 0xF122;

  function escherTree(r, from, to, depth) {
    var out = [];
    r.p = from;
    while (r.p + 8 <= to && out.length < 100000) {
      var start = r.p, vi = r.u16(), type = r.u16(), len = r.u32();
      var rec = { ver: vi & 0xF, inst: vi >>> 4, type: type, off: start + 8, len: len, kids: null };
      var end = Math.min(rec.off + len, to);
      if (rec.ver === 0xF && depth < 32) rec.kids = escherTree(r, rec.off, end, depth + 1);
      out.push(rec);
      r.p = rec.off + len;
      if (type === E_DGG || type === E_DG) r.p += 4; // Publisher writes 4 trailing bytes here
      if (r.p <= start) break;
    }
    return out;
  }
  function kid(rec, type) {
    if (!rec.kids) return null;
    for (var i = 0; i < rec.kids.length; i++) if (rec.kids[i].type === type) return rec.kids[i];
    return null;
  }
  var ARRAY_PROPS = { 0x145: 1, 0x146: 1, 0x151: 1, 0x155: 1, 0x156: 1, 0x157: 1, 0x158: 1, 0x197: 1, 0x1CF: 1, 0x383: 1, 0x384: 1 };
  /** FOPT property table: scalar values plus the complex (array / string) data that follows them. */
  function readFopt(r, rec) {
    var vals = {}, complex = {}, ids = [], i;
    if (!rec) return { v: vals, c: complex };
    r.p = rec.off;
    var end = rec.off + rec.len;
    for (i = 0; i < rec.inst && r.p + 6 <= end; i++) {
      var id = r.u16(), val = r.u32();
      vals[id] = val;
      if (id & 0x8000) ids.push(id);
    }
    for (i = 0; i < ids.length; i++) {
      var n = vals[ids[i]];
      if (!n) continue;
      if (r.p + 6 > r.n || r.p >= end) break;
      var total = n;
      if (ARRAY_PROPS[ids[i] & 0x3FFF]) {
        // Array properties carry their own element count/size; trust that over the byte count.
        var num = r.dv.getUint16(r.p, true), esz = r.dv.getUint16(r.p + 4, true);
        if (esz === 0xFFF0) esz = 4;
        total = esz * num + 6;
      }
      total = Math.min(total, r.n - r.p);
      complex[ids[i]] = r.b.subarray(r.p, r.p + total);
      r.p += total;
    }
    return { v: vals, c: complex };
  }
  /** Publisher's client anchor/data records: a repeated length, then (u16 id, u32 value) pairs. */
  function readPairs(r, rec) {
    var o = {};
    if (!rec) return o;
    r.p = rec.off + 4;
    var end = rec.off + rec.len;
    while (r.p + 6 <= end) { var id = r.u16(); o[id] = r.u32(); }
    return o;
  }

  /**
   * Page position from a client anchor's (id, value) pairs, in EMU from the page centre. Publisher leaves out a
   * coordinate that is zero (on the centre line of the page), so a missing one is 0; with none at all there is no position.
   */
  function anchorOf(an) {
    if (an[0x2001] === undefined && an[0x2002] === undefined && an[0x2003] === undefined && an[0x2004] === undefined) return null;
    return { xs: an[0x2001] | 0, ys: an[0x2002] | 0, xe: an[0x2003] | 0, ye: an[0x2004] | 0 };
  }

  function parseEscher(bytes, out, warn) {
    var r = new Reader(bytes);
    var top = escherTree(r, 0, r.n, 0);
    out.bse = []; // blip store entries: {offset,size} into the delay stream, or null
    out.drawn = []; // top-level drawing elements, in z-order (back to front)
    top.forEach(function (rec) {
      if (rec.type === E_DGG) {
        var bs = kid(rec, E_BSTORE);
        if (bs && bs.kids) bs.kids.forEach(function (b) {
          if (b.len < 36) { out.bse.push(null); return; }
          var size = r.dv.getUint32(b.off + 20, true), delay = r.dv.getUint32(b.off + 28, true);
          var hasUid = false;
          for (var i = 2; i < 18; i++) if (r.b[b.off + i]) hasUid = true;
          out.bse.push(hasUid ? { offset: delay, size: size, type: r.b[b.off] } : null);
        });
      } else if (rec.type === E_DG) {
        (rec.kids || []).forEach(function (g) {
          if (g.type === E_SPGR) parseGroup(g, null, null, true, out.drawn, 0);
        });
      }
    });

    function parseShape(sp, parentSys, parentAbs) {
      var fsp = kid(sp, E_FSP), fspgr = kid(sp, E_FSPGR);
      var s = { seq: null, type: fsp ? fsp.inst : 1, flags: 0, sys: null, abs: null, fopt: null, tert: null };
      if (fsp) s.flags = r.dv.getUint32(fsp.off + 4, true);
      s.isGroupLeader = !!(s.flags & 1);
      if (fspgr && fspgr.len >= 16) {
        r.p = fspgr.off;
        var a = r.i32(), b = r.i32(), c = r.i32(), d = r.i32();
        s.sys = { xs: Math.min(a, c), ys: Math.min(b, d), xe: Math.max(a, c), ye: Math.max(b, d) };
      }
      var data = readPairs(r, kid(sp, E_CLIENT_DATA));
      if (data[0x6801] !== undefined) s.seq = data[0x6801];
      s.fopt = readFopt(r, kid(sp, E_FOPT));
      s.tert = readFopt(r, kid(sp, E_TERTIARY));
      var ca = kid(sp, E_CLIENT_ANCHOR), ch = kid(sp, E_CHILD_ANCHOR);
      var anchor = ca ? anchorOf(readPairs(r, ca)) : null;
      if (anchor) {
        s.abs = anchor;
      } else if (ch && ch.len >= 16 && parentSys && parentAbs) {
        r.p = ch.off;
        var cw = (parentSys.xe - parentSys.xs) || 1, chh = (parentSys.ye - parentSys.ys) || 1;
        var sx = (parentAbs.xe - parentAbs.xs) / cw, sy = (parentAbs.ye - parentAbs.ys) / chh;
        var x0 = r.i32(), y0 = r.i32(), x1 = r.i32(), y1 = r.i32();
        s.abs = {
          xs: (x0 - parentSys.xs) * sx + parentAbs.xs, ys: (y0 - parentSys.ys) * sy + parentAbs.ys,
          xe: (x1 - parentSys.xs) * sx + parentAbs.xs, ye: (y1 - parentSys.ys) * sy + parentAbs.ys
        };
      }
      return s;
    }

    function parseGroup(g, parentSys, parentAbs, isPatriarch, target, depth) {
      if (!g.kids || depth > 64) return;
      var sys = parentSys, abs = parentAbs, leader = null, first = true;
      var members = [];
      g.kids.forEach(function (k) {
        if (k.type === E_SP) {
          var s = parseShape(k, sys, abs);
          if (first && s.isGroupLeader) {
            // The first shape of a group describes the group itself.
            leader = s;
            if (s.sys) sys = s.sys;
            if (s.abs) {
              abs = s.abs;
              var gr = s.fopt.v[0x0004] !== undefined ? ((((s.fopt.v[0x0004] | 0) / 65536) % 360) + 360) % 360 : 0;
              if ((gr >= 45 && gr < 135) || (gr >= 225 && gr < 315)) {
                // quarter-turned group: its anchor is the rotated box, children live in the unrotated one
                var gw = abs.xe - abs.xs, gh = abs.ye - abs.ys, gcx = abs.xs + gw / 2, gcy = abs.ys + gh / 2;
                abs = { xs: gcx - gh / 2, ys: gcy - gw / 2, xe: gcx + gh / 2, ye: gcy + gw / 2 };
              }
            }
          } else {
            members.push({ shape: s });
          }
          first = false;
        } else if (k.type === E_SPGR) {
          var sub = [];
          var ld = parseGroup(k, sys, abs, false, sub, depth + 1);
          members.push({ group: sub, leader: ld || null, seq: ld ? ld.seq : null });
          first = false;
        }
      });
      members.forEach(function (m) { target.push(m); });
      return leader;
    }
  }

  // ---------------------------------------------------------------- images (EscherDelayStm)
  var BLIP = { 0xF01A: 'emf', 0xF01B: 'wmf', 0xF01C: 'pict', 0xF01D: 'jpeg', 0xF01E: 'png', 0xF01F: 'dib', 0xF029: 'tiff', 0xF02A: 'jpeg' };
  var ONE_UID = { emf: [0x3D4], wmf: [0x216], pict: [0x542], jpeg: [0x46A, 0x6E2, 0x46B, 0x6E3], png: [0x6E0], dib: [0x7A8], tiff: [0x6E4] };

  function readBlipAt(r, at) {
    if (at + 8 > r.n) return null;
    r.p = at;
    var vi = r.u16(), type = r.u16(), len = r.u32();
    var kind = BLIP[type];
    if (!kind) return null;
    var inst = vi >>> 4;
    var one = ONE_UID[kind].indexOf(inst) >= 0;
    var hdr = 16 + (one ? 0 : 16);
    var isMeta = kind === 'emf' || kind === 'wmf' || kind === 'pict';
    var bodyStart = at + 8, bodyEnd = Math.min(bodyStart + len, r.n);
    var res = { kind: kind, bytes: null, compressed: false, next: bodyStart + len };
    if (isMeta) {
      var m = bodyStart + hdr; // metafile header: cbSize, bounds(16), size(8), cbSave, compression, filter
      if (m + 34 > bodyEnd) return res;
      res.compressed = r.b[m + 32] === 0;
      res.bounds = { l: r.dv.getInt32(m + 4, true), t: r.dv.getInt32(m + 8, true), r: r.dv.getInt32(m + 12, true), b: r.dv.getInt32(m + 16, true) };
      res.bytes = r.b.subarray(m + 34, bodyEnd);
    } else {
      var d = bodyStart + hdr + 1; // + 1 tag byte
      if (d > bodyEnd) return res;
      res.bytes = r.b.subarray(d, bodyEnd);
    }
    return res;
  }

  function dibToBmp(dib) {
    if (dib.length < 40) return null;
    var dv = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
    var hdrSize = dv.getUint32(0, true), bpp = dv.getUint16(14, true), colors = dv.getUint32(32, true);
    if (colors === 0 && bpp <= 8) colors = 1 << bpp;
    var out = new Uint8Array(dib.length + 14), o = new DataView(out.buffer);
    out[0] = 0x42; out[1] = 0x4D;
    o.setUint32(2, out.length, true);
    o.setUint32(10, 14 + hdrSize + 4 * colors, true);
    out.set(dib, 14);
    return out;
  }

  function sniffMime(b) {
    if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b.length > 2 && b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
    return null;
  }

  /** Decode every picture referenced by the blip store. Resolves to an array aligned with out.bse. */
  function loadImages(delayBytes, out, warn) {
    var r = new Reader(delayBytes || new Uint8Array(0));
    // Sequential fallback list, used when a store entry carries no usable offset.
    var seq = [], p = 0, guard = 0;
    while (p + 8 <= r.n && guard++ < 100000) {
      var bl = readBlipAt(r, p);
      if (!bl) {
        var len = r.dv.getUint32(p + 4, true);
        p += 8 + len; seq.push(null);
        if (len === 0 && p >= r.n) break;
        continue;
      }
      seq.push(bl); p = bl.next;
    }
    var si = 0, jobs = [];
    out.bse.forEach(function (e) {
      if (!e) { jobs.push(Promise.resolve(null)); return; }
      var blip = readBlipAt(r, e.offset);
      if (!blip) blip = seq[si] || null;
      si++;
      if (!blip || !blip.bytes) { jobs.push(Promise.resolve(null)); return; }
      jobs.push(decodeBlip(blip, warn));
    });
    return Promise.all(jobs);
  }

  function decodeBlip(blip, warn) {
    var k = blip.kind;
    if (k === 'jpeg' || k === 'png') {
      return Promise.resolve({ kind: k, mime: sniffMime(blip.bytes) || ('image/' + k), bytes: blip.bytes });
    }
    if (k === 'dib') {
      var bmp = dibToBmp(blip.bytes);
      return Promise.resolve(bmp ? { kind: 'bmp', mime: 'image/bmp', bytes: bmp } : null);
    }
    if (k === 'wmf' || k === 'emf') {
      var p = blip.compressed ? OP.inflate(blip.bytes) : Promise.resolve(blip.bytes);
      return p.then(function (raw) {
        return { kind: k, mime: null, bytes: raw, bounds: blip.bounds };
      }).catch(function (e) {
        warn('Could not decompress an embedded ' + k.toUpperCase() + ' picture: ' + e.message);
        return null;
      });
    }
    return Promise.resolve({ kind: k, mime: null, bytes: blip.bytes });
  }

  // ---------------------------------------------------------------- public: parse
  /**
   * Parse a .pub file into an intermediate structure.
   * @param {Uint8Array} bytes
   * @returns {Promise<Object>}
   */
  function parsePub(bytes) {
    var warnings = [];
    function warn(m) { if (warnings.indexOf(m) < 0) warnings.push(m); }
    var cfb = OP.readCFB(bytes);
    var contents = cfb.get('Contents');
    var quill = cfb.get('Quill/QuillSub/CONTENTS');
    var escher = cfb.get('Escher/EscherStm');
    if (!contents) throw new Error('This file has no "Contents" stream, so it is not a Publisher document.');
    if (!escher || escher.length === 0) {
      throw new Error('This looks like a Publisher 2000 or older file. Only Publisher 2002–2021 files can be opened.');
    }
    var out = { warnings: warnings };
    if (quill && quill.length > 0x20) {
      try { parseQuill(quill, out, warn); } catch (e) { warn('Text could not be read: ' + e.message); }
    }
    if (!out.stories) { out.stories = {}; out.storyOrder = []; out.fonts = []; out.textColors = []; out.defaultChar = []; out.defaultPara = []; }
    parseContents(contents, out, warn);
    parseEscher(escher, out, warn);
    return loadImages(cfb.get('Escher/EscherDelayStm'), out, warn).then(function (imgs) {
      out.images = imgs;
      return out;
    });
  }

  OP.Reader = Reader;
  OP.parsePub = parsePub;
  OP.pubInternals = { resolveColor: resolveColor, toHex: toHex, EMU_PER_PT: EMU_PER_PT, anchorOf: anchorOf };
})();
