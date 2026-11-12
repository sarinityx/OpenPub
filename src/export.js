/* OpenPub – output: PDF (with bleed, crop marks, tiling), PNG/JPEG, SVG, ZIP and file saving. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var MM = OP.MM;

  // ---------------------------------------------------------------- saving files
  /**
   * Hand a generated file to the user. Inside a Claude artifact this goes through the
   * downloads capability; in a normal browser tab it is an ordinary download.
   */
  OP.saveFile = async function (filename, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    if (OP.desktop) { // native save dialog
      var res = await OP.desktop.saveFile({ name: filename, bytes: new Uint8Array(await blob.arrayBuffer()) });
      if (!res || res.cancelled) { var cc = new Error('Save cancelled.'); cc.cancelled = true; throw cc; }
      if (res.error) throw new Error(res.error);
      return res;
    }
    if (window.claude && typeof window.claude.use === 'function') {
      var dl = null;
      try { dl = await window.claude.use('downloads'); } catch (e) { dl = null; }
      if (!dl) throw new Error('Saving files is not available in this view.');
      try { await dl.save({ filename: filename, data: blob }); }
      catch (e) {
        if (e && e.code === 'declined') { var c = new Error('Save cancelled.'); c.cancelled = true; throw c; }
        throw new Error((e && e.message) || 'The file could not be saved.');
      }
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  };

  OP.safeName = function (s) {
    return (String(s || 'Untitled').replace(/\.[a-z0-9.]{2,12}$/i, '').replace(/[^\w\- ]+/g, '').trim() || 'Untitled').slice(0, 80);
  };

  // ---------------------------------------------------------------- ZIP (stored, no compression)
  var crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); crcTable[n] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  /** @param {{name:string, bytes:Uint8Array}[]} files */
  OP.makeZip = function (files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.bytes);
      var lh = new Uint8Array(30 + name.length), v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint32(14, crc, true); v.setUint32(18, f.bytes.length, true); v.setUint32(22, f.bytes.length, true);
      v.setUint16(26, name.length, true);
      lh.set(name, 30);
      var ch = new Uint8Array(46 + name.length), c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, f.bytes.length, true); c.setUint32(24, f.bytes.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      ch.set(name, 46);
      parts.push(lh, f.bytes); central.push(ch);
      offset += lh.length + f.bytes.length;
    });
    var csize = 0;
    central.forEach(function (c) { csize += c.length; });
    var end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  };

  // ---------------------------------------------------------------- PDF writer (image pages + vector marks)
  function PdfWriter() { this.objs = [null, null]; this.pageIds = []; this.fontId = this.add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']); }
  PdfWriter.prototype.add = function (parts) { this.objs.push(parts); return this.objs.length; };
  function num(v) { return (Math.round(v * 1000) / 1000).toString(); }
  /**
   * @param {Object} pg {mw, mh, trim:[x0,y0,x1,y1], bleed:[..], images:[{bytes,pw,ph,x,y,w,h}], lines:[[x1,y1,x2,y2]], texts:[{x,y,size,str}]}
   * All coordinates use a top-left origin; they are flipped for PDF here.
   */
  PdfWriter.prototype.addPage = function (pg) {
    var self = this, content = '', xobj = '';
    pg.images.forEach(function (im, i) {
      var id = self.add(['<< /Type /XObject /Subtype /Image /Width ' + im.pw + ' /Height ' + im.ph +
        (im.cmyk ? ' /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /FlateDecode' : ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode') +
        ' /Length ' + im.bytes.length + ' >>\nstream\n', im.bytes, '\nendstream']);
      xobj += '/Im' + i + ' ' + id + ' 0 R ';
      content += 'q ' + num(im.w) + ' 0 0 ' + num(im.h) + ' ' + num(im.x) + ' ' + num(pg.mh - im.y - im.h) + ' cm /Im' + i + ' Do Q\n';
    });
    if (pg.lines && pg.lines.length) {
      content += (pg.cmyk ? '0 0 0 1 K' : '0 G') + ' 0.3 w\n';
      pg.lines.forEach(function (l) { content += num(l[0]) + ' ' + num(pg.mh - l[1]) + ' m ' + num(l[2]) + ' ' + num(pg.mh - l[3]) + ' l S\n'; });
    }
    (pg.texts || []).forEach(function (t) {
      var s = t.str.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
      content += 'BT /F1 ' + num(t.size) + ' Tf 0.35 g ' + num(t.x) + ' ' + num(pg.mh - t.y) + ' Td (' + s + ') Tj ET\n';
    });
    var cid = this.add(['<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream']);
    function box(name, b) { return b ? ' /' + name + ' [' + num(b[0]) + ' ' + num(pg.mh - b[3]) + ' ' + num(b[2]) + ' ' + num(pg.mh - b[1]) + ']' : ''; }
    var pid = this.add(['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(pg.mw) + ' ' + num(pg.mh) + ']' + box('TrimBox', pg.trim) + box('BleedBox', pg.bleed) +
      ' /Resources << /XObject << ' + xobj + '>> /Font << /F1 ' + this.fontId + ' 0 R >> >> /Contents ' + cid + ' 0 R >>']);
    this.pageIds.push(pid);
  };
  PdfWriter.prototype.finish = function (title) {
    var t = String(title || 'Untitled').replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
    this.objs[0] = ['<< /Type /Catalog /Pages 2 0 R >>'];
    this.objs[1] = ['<< /Type /Pages /Kids [' + this.pageIds.map(function (i) { return i + ' 0 R'; }).join(' ') + '] /Count ' + this.pageIds.length + ' >>'];
    var infoId = this.add(['<< /Title (' + t + ') /Producer (OpenPub) >>']);
    var enc = new TextEncoder(), chunks = [], pos = 0, offsets = [];
    function put(x) { var b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; }
    put('%PDF-1.4\n%âãÏÓ\n');
    this.objs.forEach(function (parts, i) {
      offsets.push(pos);
      put((i + 1) + ' 0 obj\n');
      parts.forEach(put);
      put('\nendobj\n');
    });
    var xref = pos, n = this.objs.length + 1;
    var x = 'xref\n0 ' + n + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { x += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    put(x + 'trailer\n<< /Size ' + n + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(chunks, { type: 'application/pdf' });
  };
  OP.PdfWriter = PdfWriter;

  // ---------------------------------------------------------------- rasterising
  function canvasBytes(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (!b) { reject(new Error('The browser could not encode the image (it may be too large).')); return; }
        b.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }, reject);
      }, type, quality);
    });
  }
  var MAX_SIDE = 16000, BAND_PIXELS = 12e6;

  /** Largest resolution (dpi) at which a width in points can be rendered. */
  OP.maxDpiFor = function (widthPt) { return Math.floor(MAX_SIDE / widthPt * 72); };

  /**
   * Render a region of a page as horizontal JPEG bands (so even A0 at 300 dpi fits in memory).
   * region is in page points; scale = poster enlargement; k = pixels per output point.
   */
  async function rasterBands(doc, page, region, k, scale, clip, quality, tick, extra) {
    var s = k * scale;
    var totalW = Math.max(1, Math.round(region.w * s)), totalH = Math.max(1, Math.round(region.h * s));
    var band = Math.max(64, Math.floor(BAND_PIXELS / totalW)), out = [];
    for (var y0 = 0; y0 < totalH; y0 += band) {
      var bh = Math.min(band + 2, totalH - y0); // 2 px overlap hides seams between bands
      var c = document.createElement('canvas');
      c.width = totalW; c.height = bh;
      var ctx = c.getContext('2d');
      if (!ctx) throw new Error('Not enough memory to render at this resolution. Try a lower DPI.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalW, bh);
      ctx.setTransform(s, 0, 0, s, -region.x * s, -region.y * s - y0);
      ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip();
      OP.renderPage(ctx, doc, page, { bleed: Math.max(0, -clip.x), pxPerPt: s, env: extra && extra.env });
      var bytes, cmyk = !!(extra && extra.cmyk);
      if (cmyk) bytes = await OP.deflate(rgbaToCmyk(ctx.getImageData(0, 0, totalW, bh).data));
      else bytes = await canvasBytes(c, 'image/jpeg', quality);
      out.push({ bytes: bytes, pw: totalW, ph: bh, y: y0 / k, h: bh / k, w: totalW / k, cmyk: cmyk });
      c.width = c.height = 1; // release memory early
      if (tick) await tick();
    }
    return out;
  }

  function pause() { return new Promise(function (r) { setTimeout(r, 0); }); }
  /** Device CMYK from RGB with full black replacement. No ICC profile: the press decides the final colour. */
  function rgbaToCmyk(px) {
    var n = px.length / 4, out = new Uint8Array(n * 4);
    for (var i = 0, j = 0; i < px.length; i += 4, j += 4) {
      var c = 255 - px[i], m = 255 - px[i + 1], y = 255 - px[i + 2], k = c < m ? (c < y ? c : y) : (m < y ? m : y);
      if (k === 255) { out[j] = 0; out[j + 1] = 0; out[j + 2] = 0; out[j + 3] = 255; continue; }
      var d = 255 - k;
      out[j] = Math.round((c - k) * 255 / d); out[j + 1] = Math.round((m - k) * 255 / d); out[j + 2] = Math.round((y - k) * 255 / d); out[j + 3] = k;
    }
    return out;
  }
  OP.rgbaToCmyk = rgbaToCmyk;

  /**
   * Export pages as a print PDF.
   * opts: {pages:number[], dpi, bleed:boolean, marks:boolean, quality, onProgress(fraction)}
   */
  OP.exportPdf = async function (doc, opts) {
    await OP.ensureImages(doc);
    var dpi = Math.min(opts.dpi || 300, OP.maxDpiFor(doc.w + 2 * doc.bleed)), k = dpi / 72;
    var b = opts.bleed ? doc.bleed : 0;
    var gap = 2 * MM, len = 5 * MM;
    var slug = opts.marks ? b + gap + len + 1 * MM : b;
    var pdf = new PdfWriter();
    var recs = (opts.records && opts.records.length) ? opts.records : [undefined], total = recs.length * opts.pages.length, done = 0;
    if (opts.cmyk) k = Math.min(dpi, 300) / 72; // uncompressed-size guard: CMYK pages are stored losslessly
    for (var ri = 0; ri < recs.length; ri++) for (var i = 0; i < opts.pages.length; i++) {
      var page = doc.pages[opts.pages[i]];
      var region = { x: -b, y: -b, w: doc.w + 2 * b, h: doc.h + 2 * b };
      var env = OP.pageEnv(doc, page, recs[ri]);
      var bands = await rasterBands(doc, page, region, k, 1, region, opts.quality || 0.92, pause, { env: env, cmyk: !!opts.cmyk });
      var ox = slug - b, oy = slug - b;
      var lines = [];
      if (opts.marks) {
        var x0 = slug, y0 = slug, x1 = slug + doc.w, y1 = slug + doc.h, o = b + gap;
        [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]].forEach(function (c) {
          lines.push([c[0] + c[2] * o, c[1], c[0] + c[2] * (o + len), c[1]]);
          lines.push([c[0], c[1] + c[3] * o, c[0], c[1] + c[3] * (o + len)]);
        });
      }
      pdf.addPage({
        mw: doc.w + 2 * slug, mh: doc.h + 2 * slug, cmyk: !!opts.cmyk,
        trim: [slug, slug, slug + doc.w, slug + doc.h],
        bleed: [slug - b, slug - b, slug + doc.w + b, slug + doc.h + b],
        images: bands.map(function (bd) { return { bytes: bd.bytes, pw: bd.pw, ph: bd.ph, x: ox, y: oy + bd.y, w: bd.w, h: bd.h, cmyk: bd.cmyk }; }),
        lines: lines
      });
      done++;
      if (opts.onProgress) opts.onProgress(done / total);
    }
    return { blob: pdf.finish(doc.name), dpi: dpi };
  };

  /** Work out the sheet grid for tiled ("poster") printing. All lengths in points. */
  OP.tilePlan = function (doc, o) {
    var sw = o.landscape ? o.sheetH : o.sheetW, sh = o.landscape ? o.sheetW : o.sheetH;
    var aw = sw - 2 * o.margin, ah = sh - 2 * o.margin;
    var pw = doc.w * o.scale, ph = doc.h * o.scale;
    var stepX = aw - o.overlap, stepY = ah - o.overlap;
    if (aw <= 10 || ah <= 10 || stepX <= 10 || stepY <= 10) return null;
    var cols = Math.max(1, Math.ceil((pw - o.overlap) / stepX - 1e-6)), rows = Math.max(1, Math.ceil((ph - o.overlap) / stepY - 1e-6));
    return { sw: sw, sh: sh, aw: aw, ah: ah, stepX: stepX, stepY: stepY, cols: cols, rows: rows, pw: pw, ph: ph };
  };

  /**
   * Split one page across several sheets of office paper, with overlap and trim marks.
   * opts: {page, sheetW, sheetH, landscape, margin, overlap, scale, dpi, onProgress}
   */
  OP.exportTiledPdf = async function (doc, opts) {
    await OP.ensureImages(doc);
    var plan = OP.tilePlan(doc, opts);
    if (!plan) throw new Error('The margins and overlap leave no printable area on the sheet.');
    var page = doc.pages[opts.page], k = (opts.dpi || 200) / 72, s = opts.scale, m = opts.margin;
    var pdf = new PdfWriter(), total = plan.cols * plan.rows, done = 0;
    for (var r = 0; r < plan.rows; r++) {
      for (var c = 0; c < plan.cols; c++) {
        var region = { x: c * plan.stepX / s, y: r * plan.stepY / s, w: plan.aw / s, h: plan.ah / s };
        var clip = { x: 0, y: 0, w: doc.w, h: doc.h };
        var bands = await rasterBands(doc, page, region, k, s, clip, 0.92, pause);
        var lines = [], t = 4 * MM, x0 = m, y0 = m, x1 = m + plan.aw, y1 = m + plan.ah;
        if (m >= 3 * MM) {
          t = Math.min(t, m - 1);
          [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]].forEach(function (q) {
            lines.push([q[0] + q[2] * 1, q[1], q[0] + q[2] * t, q[1]]);
            lines.push([q[0], q[1] + q[3] * 1, q[0], q[1] + q[3] * t]);
          });
          // ticks showing where the next sheet's printed area begins (the overlap)
          if (opts.overlap > 0) {
            if (c < plan.cols - 1) { lines.push([x1 - opts.overlap, y0 - 1, x1 - opts.overlap, y0 - t]); lines.push([x1 - opts.overlap, y1 + 1, x1 - opts.overlap, y1 + t]); }
            if (r < plan.rows - 1) { lines.push([x0 - 1, y1 - opts.overlap, x0 - t, y1 - opts.overlap]); lines.push([x1 + 1, y1 - opts.overlap, x1 + t, y1 - opts.overlap]); }
          }
        }
        var texts = m >= 6 * MM ? [{ x: m + 6 * MM, y: plan.sh - m / 2 + 2, size: 7, str: 'Row ' + (r + 1) + ' of ' + plan.rows + ', column ' + (c + 1) + ' of ' + plan.cols + '  -  ' + doc.name }] : [];
        pdf.addPage({
          mw: plan.sw, mh: plan.sh,
          images: bands.map(function (bd) { return { bytes: bd.bytes, pw: bd.pw, ph: bd.ph, x: m, y: m + bd.y, w: bd.w, h: bd.h }; }),
          lines: lines, texts: texts
        });
        done++;
        if (opts.onProgress) opts.onProgress(done / total);
      }
    }
    return { blob: pdf.finish(doc.name + ' (tiled)'), plan: plan };
  };

  /** One page as PNG or JPEG bytes. Resolution is reduced if the browser cannot make a canvas that large. */
  OP.exportImage = async function (doc, pageIndex, opts) {
    await OP.ensureImages(doc);
    var b = opts.bleed ? doc.bleed : 0, W = doc.w + 2 * b, H = doc.h + 2 * b;
    var dpi = opts.dpi || 150;
    var maxByArea = Math.sqrt(120e6 / (W * H)) * 72;
    dpi = Math.floor(Math.min(dpi, OP.maxDpiFor(Math.max(W, H)), maxByArea));
    var c = OP.pageToCanvas(doc, doc.pages[pageIndex], dpi / 72, { bleed: b });
    var bytes = await canvasBytes(c, opts.type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
    return { bytes: bytes, dpi: dpi };
  };

  // ---------------------------------------------------------------- SVG (vector)
  /** One page as a standalone SVG document. Text stays text; fonts are referenced by name, not embedded. */
  OP.pageToSvg = function (doc, page, opts) {
    var b = (opts && opts.bleed) ? doc.bleed : 0, esc = OP.escXml, r = OP.round;
    var defs = [], body = [], uid = 0, pre = (opts && opts.idPrefix) || '';
    function paintFill(fill, w, h) {
      if (!fill) return 'none';
      if (fill.type === 'solid') return fill.color;
      if (fill.type === 'linear' || fill.type === 'radial') {
        var id = pre + 'g' + (uid++), stops = (fill.stops || []).map(function (s) { return '<stop offset="' + r(s[0], 4) + '" stop-color="' + esc(s[1]) + '"/>'; }).join('');
        if (fill.type === 'linear') {
          var l = OP.gradientLine(w, h, fill.angle);
          defs.push('<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + r(l.x0) + '" y1="' + r(l.y0) + '" x2="' + r(l.x1) + '" y2="' + r(l.y1) + '">' + stops + '</linearGradient>');
        } else {
          defs.push('<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + r(w / 2) + '" cy="' + r(h / 2) + '" r="' + r(Math.max(w, h) / 2) + '">' + stops + '</radialGradient>');
        }
        return 'url(#' + id + ')';
      }
      return 'none';
    }
    function strokeAttrs(st) {
      if (!st || !(st.width > 0)) return '';
      var d = OP.dashArray(st);
      return ' stroke="' + esc(st.color) + '" stroke-width="' + r(st.width) + '" stroke-miterlimit="8"' + (d.length ? ' stroke-dasharray="' + d.map(function (v) { return r(v); }).join(' ') + '"' : '');
    }
    function imageTag(asset, crop, w, h) {
      var a = doc.assets[asset];
      if (!a) return '<rect width="' + r(w) + '" height="' + r(h) + '" fill="#e9e7e2"/>';
      crop = crop || { l: 0, t: 0, r: 0, b: 0 };
      var fw = w / Math.max(0.01, 1 - crop.l - crop.r), fh = h / Math.max(0.01, 1 - crop.t - crop.b);
      var id = pre + 'c' + (uid++);
      defs.push('<clipPath id="' + id + '"><rect width="' + r(w) + '" height="' + r(h) + '"/></clipPath>');
      var ref = opts && opts.imageRef ? opts.imageRef(asset) : null;
      if (ref) return '<g clip-path="url(#' + id + ')"><use href="#' + ref + '" transform="translate(' + r(-crop.l * fw) + ' ' + r(-crop.t * fh) + ') scale(' + r(fw, 4) + ' ' + r(fh, 4) + ')"/></g>';
      return '<g clip-path="url(#' + id + ')"><image x="' + r(-crop.l * fw) + '" y="' + r(-crop.t * fh) + '" width="' + r(fw) + '" height="' + r(fh) + '" preserveAspectRatio="none" href="' + a.src + '"/></g>';
    }
    OP.reindex(doc);
    var env = (opts && opts.env) || OP.pageEnv(doc, page);
    function textSvg(src, useDoc) {
      var tc = OP.textCols(useDoc ? doc : null, src, env), g = '';
      if (!tc || !tc.cols.length) return '';
      var cid = pre + 'c' + (uid++);
      defs.push('<clipPath id="' + cid + '"><rect width="' + r(src.w) + '" height="' + r(src.h) + '"/></clipPath>');
      g += '<g clip-path="url(#' + cid + ')">';
      tc.cols.forEach(function (col) {
        var lay = col.lay, sc = lay.scale || 1;
        lay.lines.forEach(function (ln) {
          if (col.y + ln.y > src.h) return;
          ln.segs.forEach(function (s) {
            var sz = s.run.size * sc, x = col.x + s.x, y = col.y + ln.base, colr = esc(s.run.color || '#000000');
            if (s.text) {
              g += '<text x="' + r(x) + '" y="' + r(y) + '" font-family="' + esc(OP.fontStack(s.run.font).replace(/"/g, "'")) + '" font-size="' + r(sz) + '"' +
                (s.run.b ? ' font-weight="bold"' : '') + (s.run.i ? ' font-style="italic"' : '') + (s.sp ? ' letter-spacing="' + r(s.sp, 3) + '"' : '') +
                ' fill="' + colr + '" xml:space="preserve">' + esc(s.text) + '</text>';
            }
            if (s.run.u) g += '<rect x="' + r(x) + '" y="' + r(y + sz * 0.1) + '" width="' + r(s.w) + '" height="' + r(Math.max(0.5, sz / 16)) + '" fill="' + colr + '"/>';
            if (s.run.s) g += '<rect x="' + r(x) + '" y="' + r(y - sz * 0.3) + '" width="' + r(s.w) + '" height="' + r(Math.max(0.5, sz / 16)) + '" fill="' + colr + '"/>';
          });
        });
      });
      return g + '</g>';
    }
    function shadowStyle(it) {
      var sh = it.shadow;
      return sh ? ' style="filter:drop-shadow(' + r(sh.dx) + 'px ' + r(sh.dy) + 'px ' + r((sh.blur || 0) / 2) + 'px ' + esc(sh.color || 'rgba(0,0,0,0.4)') + ')"' : '';
    }
    function itemSvg(it) {
      if (it.hidden) return '';
      var w = it.w, h = it.h, cx = it.x + w / 2, cy = it.y + h / 2;
      var outer = 'translate(' + r(cx) + ' ' + r(cy) + ')' + (it.rot ? ' rotate(' + r(it.rot) + ')' : '');
      var flip = (it.flipH || it.flipV) ? ' scale(' + (it.flipH ? -1 : 1) + ' ' + (it.flipV ? -1 : 1) + ')' : '';
      var g = '<g transform="' + outer + '"' + (it.opacity < 1 ? ' opacity="' + r(it.opacity, 3) + '"' : '') + '>';
      var back = ' translate(' + r(-w / 2) + ' ' + r(-h / 2) + ')';
      if (it.type === 'table') return g + '<g transform="' + back.trim() + '">' + OP.tableSvg(it, function (ci) { return textSvg(ci, false); }) + '</g></g>';
      if (it.wa) {
        var grad = it.fill && (it.fill.type === 'linear' || it.fill.type === 'radial');
        return g + '<g transform="' + (flip + back).trim() + '">' + OP.wordArtSvg(it, it.fill ? esc(paintFill(it.fill, w, h)) : 'none', grad, function () { return pre + 'm' + (uid++); }) + '</g></g>';
      }
      g += '<g transform="' + (flip + back).trim() + '"' + ((it.type === 'image' || it.fill) ? shadowStyle(it) : '') + '>';
      var mp = it.type === 'image' ? OP.maskPath(it) : null, d = mp || OP.shapePath(it);
      if (it.type === 'image') {
        var tag = imageTag(it.asset, it.crop, w, h), flt = OP.adjFilter(it.adj);
        if (flt) tag = '<g style="filter:' + esc(flt) + '">' + tag + '</g>';
        if (mp) { var mid = pre + 'c' + (uid++); defs.push('<clipPath id="' + mid + '"><path d="' + mp + '"/></clipPath>'); tag = '<g clip-path="url(#' + mid + ')">' + tag + '</g>'; }
        g += tag;
        if (it.stroke) g += '<path d="' + d + '" fill="none"' + strokeAttrs(it.stroke) + '/>';
      } else {
        var open = OP.isOpen(it), fill = open ? null : it.fill;
        if (fill && fill.type === 'image') {
          var cid = pre + 'c' + (uid++);
          defs.push('<clipPath id="' + cid + '"><path d="' + d + '"/></clipPath>');
          var a = doc.assets[fill.asset];
          if (a) g += '<image clip-path="url(#' + cid + ')" width="' + r(w) + '" height="' + r(h) + '" preserveAspectRatio="none" href="' + a.src + '"/>';
          fill = null;
        }
        if (fill || it.stroke) {
          g += '<path d="' + d + '" fill="' + paintFill(fill, w, h) + '"' + (fill && fill.opacity < 1 ? ' fill-opacity="' + fill.opacity + '"' : '') + strokeAttrs(it.stroke) + '/>';
        }
        var ad = it.stroke ? OP.arrowPath(it) : '';
        if (ad) g += '<path d="' + ad + '" fill="' + esc(it.stroke.color) + '"/>';
      }
      g += '</g>';
      if (it.type === 'shape' && it.text) g += '<g transform="' + back.trim() + '">' + textSvg(it, true) + '</g>';
      return g + '</g>';
    }
    var master = OP.masterOf(doc, page);
    if (master) master.items.forEach(function (it) { body.push(itemSvg(it)); });
    page.items.forEach(function (it) { body.push(itemSvg(it)); });
    var W = doc.w + 2 * b, H = doc.h + 2 * b;
    if (opts && opts.embed) { // placed inside a sheet: position and size in points
      var e = opts.embed;
      return '<svg x="' + r(e.x) + '" y="' + r(e.y) + '" width="' + r(W * e.scale) + '" height="' + r(H * e.scale) + '" viewBox="' + r(-b) + ' ' + r(-b) + ' ' + r(W) + ' ' + r(H) + '" overflow="hidden">' +
        '<defs>' + defs.join('') + '</defs><rect x="' + r(-b) + '" y="' + r(-b) + '" width="' + r(W) + '" height="' + r(H) + '" fill="' + esc(page.bg || '#ffffff') + '"/>' + body.join('') + '</svg>';
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + r(W / MM, 2) + 'mm" height="' + r(H / MM, 2) + 'mm" viewBox=""' + r(-b) + ' ' + r(-b) + ' ' + r(W) + ' ' + r(H) + '">' +
      '<defs>' + defs.join('') + '</defs><rect x="' + r(-b) + '" y="' + r(-b) + '" width="' + r(W) + '" height="' + r(H) + '" fill="' + esc(page.bg || '#ffffff') + '"/>' + body.join('') + '</svg>';
  };
})();
