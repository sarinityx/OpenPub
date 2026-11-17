/* OpenPub – turn a parsed .pub (see pub.js) into an OpenPub document. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';
  var EMU = 12700;

  var KIND = {
    1: 'rect', 2: 'roundrect', 3: 'ellipse', 4: 'diamond', 5: 'triangle', 6: 'rtriangle', 7: 'parallelogram',
    8: 'trapezoid', 9: 'hexagon', 10: 'octagon', 11: 'plus', 12: 'star5', 13: 'arrowR', 15: 'homeplate',
    20: 'line', 32: 'line', 55: 'chevron', 56: 'pentagon', 58: 'star8', 59: 'star16', 60: 'star24',
    61: 'callout', 62: 'callout', 63: 'callout', 66: 'arrowL', 67: 'arrowD', 68: 'arrowU', 69: 'arrowLR',
    71: 'star16', 72: 'star16', 74: 'heart', 75: 'rect', 92: 'star24', 109: 'rect', 110: 'diamond',
    116: 'roundrect', 120: 'ellipse', 176: 'roundrect', 183: 'star16', 187: 'star4', 201: 'rect', 202: 'rect'
  };
  var DASH = { 1: 'dash', 2: 'dot', 3: 'dashdot', 4: 'dashdot', 5: 'dot', 6: 'dash', 7: 'longdash', 8: 'dashdot', 9: 'dashdot', 10: 'dashdot' };

  function mod(a, b) { return ((a % b) + b) % b; }
  function fixed(v) { return (v | 0) / 65536; }
  function utf16(bytes) {
    var s = '';
    for (var i = 0; i + 1 < bytes.length; i += 2) {
      var c = bytes[i] | (bytes[i + 1] << 8);
      if (c) s += String.fromCharCode(c);
    }
    return s;
  }

  /**
   * @param {Object} pub result of OP.parsePub
   * @param {string} name document name
   * @returns {{doc:Object, notes:string[]}}
   */
  OP.pubToDoc = function (pub, name, opts) {
    var I = OP.pubInternals;
    var W = pub.widthEmu ? pub.widthEmu / EMU : 595.28, H = pub.heightEmu ? pub.heightEmu / EMU : 841.89;
    var doc = OP.newDoc(W, H);
    doc.name = name || 'Imported';
    doc.pages = [];
    doc.margins = { l: 0, t: 0, r: 0, b: 0 };
    var notes = pub.warnings.slice();
    function note(m) { if (notes.indexOf(m) < 0) notes.push(m); }
    function color(ref, base) { return I.toHex(I.resolveColor(ref, pub.palette, base)); }

    // ---- pictures -> assets
    var assetIds = (pub.images || []).map(function (img) {
      if (!img) return null;
      if (img.mime) return OP.addAsset(doc, OP.bytesToDataUrl(img.bytes, img.mime));
      if (img.kind === 'wmf' && OP.wmfToSvg) {
        try {
          var svg = OP.wmfToSvg(img.bytes);
          if (svg) return OP.addAsset(doc, OP.bytesToDataUrl(new TextEncoder().encode(svg.svg), 'image/svg+xml'), { w: svg.w, h: svg.h, note: 'Converted from WMF' });
        } catch (e) { /* fall through to the note below */ }
        note('A WMF picture could not be converted and is shown as a placeholder.');
        return null;
      }
      if (img.kind === 'emf' && OP.emfToSvg) {
        try {
          var esvg = OP.emfToSvg(img.bytes);
          if (esvg) return OP.addAsset(doc, OP.bytesToDataUrl(new TextEncoder().encode(esvg.svg), 'image/svg+xml'), { w: esvg.w, h: esvg.h, note: 'Converted from EMF' });
        } catch (e2) { /* fall through to the note below */ }
        note('An EMF picture could not be converted (EMF+ only or unsupported records) and is shown as a placeholder.');
        return null;
      }
      note('Pictures in ' + img.kind.toUpperCase() + ' format cannot be displayed and are shown as placeholders.');
      return null;
    });
    function assetFor(pxId) { return (pxId > 0 && pxId <= assetIds.length) ? assetIds[pxId - 1] : null; }

    // ---- text
    function cleanText(t, style) {
      t = t.replace(/\r/g, '').replace(/\x0b/g, '\n').replace(/[\x00-\x08\x0c\x0e-\x1f]/g, '');
      return style.allCaps ? t.toUpperCase() : t;
    }
    function convParas(srcParas) {
      var out = [];
      srcParas.forEach(function (p) {
        var ps = p.style || {};
        var di = ps.defaultIndex;
        var dp = (di !== undefined && pub.defaultPara[di]) || {};
        var dc = pub.defaultChar[di === undefined ? 0 : di] || pub.defaultChar[0] || {};
        var al = ps.align !== undefined ? ps.align : dp.align;
        var runs = [];
        p.runs.forEach(function (r) {
          var cs = r.style || {};
          var t = cleanText(r.text, cs);
          if (!t.length) return;
          var ci = cs.colorIndex !== undefined ? cs.colorIndex : dc.colorIndex;
          var fi = cs.fontIndex !== undefined ? cs.fontIndex : dc.fontIndex;
          runs.push(OP.newRun(t, {
            font: (fi !== undefined && pub.fonts[fi]) || pub.fonts[0] || 'Times New Roman',
            size: OP.round(cs.size || dc.size || 10, 2),
            b: !!cs.bold !== !!dc.bold,
            i: !!cs.italic !== !!dc.italic,
            u: cs.underline !== undefined ? !!cs.underline : !!dc.underline,
            color: (ci !== undefined && ci < pub.textColors.length) ? color(pub.textColors[ci]) : '#000000'
          }));
        });
        if (!runs.length) {
          var first = (p.runs[0] && p.runs[0].style) || {};
          var fi0 = first.fontIndex !== undefined ? first.fontIndex : dc.fontIndex;
          runs.push(OP.newRun('', { font: (fi0 !== undefined && pub.fonts[fi0]) || pub.fonts[0] || 'Times New Roman', size: OP.round(first.size || dc.size || 10, 2) }));
        }
        function pick(k) { return ps[k] !== undefined ? ps[k] : (dp[k] !== undefined ? dp[k] : 0); }
        out.push(OP.newPara(runs, {
          align: al === 2 ? 'center' : al === 1 ? 'right' : al === 6 ? 'justify' : 'left',
          ls: OP.round(ps.ls || dp.ls || 1, 3),
          lsPt: ps.lsPt || dp.lsPt || null,
          before: OP.round(pick('before'), 2), after: OP.round(pick('after'), 2),
          indent: OP.round(pick('indent'), 2), left: OP.round(pick('left'), 2), right: OP.round(pick('right'), 2),
          bullet: (ps.list || dp.list) ? '•' : null
        }));
      });
      return out;
    }
    // Linked text boxes share one story. Count the boxes per story so text can be poured through them.
    var frameCount = {};
    Object.keys(pub.shapes).forEach(function (k) {
      var id = pub.shapes[k].textId;
      if (id !== null && id !== undefined) frameCount[id] = (frameCount[id] || 0) + 1;
    });
    var flowState = {}; // story id -> boxes that share it: [{item, info, n}]
    var canFlow = !!(opts && opts.flow && OP.splitParasAtHeight);
    function storyFor(textId) {
      if (textId === null || textId === undefined) return null;
      return pub.stories[textId] || null;
    }
    /**
     * Text for one box of a story. A story in one box gets its text here. Boxes that share a story are
     * collected and chained once every page is converted (linkStories), in the order the file gives.
     */
    function takeText(story, item, info) {
      if ((frameCount[story.id] || 1) < 2) return convParas(story.paras);
      (flowState[story.id] = flowState[story.id] || []).push({ item: item, info: info, n: flowState[story.id] ? flowState[story.id].length : 0 });
      return [OP.newPara()];
    }
    /** Chain linked boxes: by Publisher's place-in-chain numbers, else by its next-box links, else in file order. */
    function linkStories() {
      Object.keys(flowState).forEach(function (sid) {
        var boxes = flowState[sid], story = pub.stories[sid];
        if (!boxes.length || !story) return;
        var bySeq = {};
        boxes.forEach(function (b) { if (b.info.seq !== undefined) bySeq[b.info.seq] = b; });
        var ordered = null;
        if (boxes.every(function (b) { return b.info.prevBox !== undefined || b.info.nextBox !== undefined || boxes.length === 1; })) {
          // follow the next-box links from the box that has no previous one
          var head = boxes.filter(function (b) { return b.info.prevBox === undefined || !bySeq[b.info.prevBox]; })[0], seen = {};
          ordered = [];
          for (var cur = head; cur && !seen[cur.info.seq]; cur = bySeq[cur.info.nextBox]) { seen[cur.info.seq] = true; ordered.push(cur); }
          if (ordered.length !== boxes.length) ordered = null;
        }
        if (!ordered) {
          ordered = boxes.slice().sort(function (a, b) { return ((a.info.chainIndex || 0) - (b.info.chainIndex || 0)) || (a.n - b.n); });
          note('Linked text boxes are kept linked. If the text runs through them in the wrong order, re-link them (Properties › Text flow).');
        }
        ordered[0].item.text.paras = convParas(story.paras);
        for (var i = 0; i + 1 < ordered.length; i++) ordered[i].item.next = ordered[i + 1].item.id;
      });
    }

    // ---- fills / lines
    function gradientStops(v, cplx) {
      var c1 = v[0x181] !== undefined ? v[0x181] : 0x00FFFFFF, c2 = v[0x183] !== undefined ? v[0x183] : 0x00FFFFFF;
      var a = color(c1), b = color(c2, c1);
      var focus = v[0x18C] !== undefined ? ((v[0x18C] << 16) >> 16) : 0;
      var data = cplx[0xC197];
      if (data && data.length > 6) {
        var cnt = Math.min(data[0] | (data[1] << 8), Math.floor((data.length - 6) / 8)), stops = [];
        var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        for (var i = 0; i < cnt; i++) stops.push([OP.clamp(fixed(dv.getUint32(6 + i * 8 + 4, true)), 0, 1), color(dv.getUint32(6 + i * 8, true))]);
        if (stops.length >= 2) {
          stops.sort(function (p, q) { return p[0] - q[0]; });
          if (focus === 100) stops = stops.map(function (s) { return [1 - s[0], s[1]]; }).reverse();
          return stops;
        }
      }
      if (focus === 0) return [[0, a], [1, b]];
      if (focus === 100) return [[0, b], [1, a]];
      if (focus > 0) return [[0, b], [focus / 100, a], [1, b]];
      return [[0, a], [(100 + focus) / 100, b], [1, a]];
    }
    function fillOf(s, isBg) {
      var v = s.fopt.v, ft = v[0x180] === undefined ? 0 : v[0x180], bp = v[0x1BF];
      var explicitOff = bp !== undefined && (bp & 0xF0) === 0;
      if (explicitOff && !isBg) return null;
      if (ft === 0 || ft === 1) {
        if (ft === 1) note('Pattern fills are shown as solid colours.');
        if (v[0x181] === undefined) {
          return (bp !== undefined && (bp & 0x10) && (bp & 0x100000)) ? { type: 'solid', color: '#ffffff' } : null;
        }
        var f = { type: 'solid', color: color(v[0x181]) };
        if (v[0x182] !== undefined && v[0x182] < 0x10000) f.opacity = OP.round(v[0x182] / 0x10000, 3);
        return f;
      }
      if (ft >= 4 && ft <= 7) {
        var stops = gradientStops(v, s.fopt.c);
        if (ft === 5 || ft === 6) return { type: 'radial', stops: stops.slice().reverse() };
        return { type: 'linear', angle: mod((v[0x18B] | 0) >> 16, 360), stops: stops };
      }
      if (ft === 2 || ft === 3) {
        var a = assetFor(v[0x4186]);
        return a ? { type: 'image', asset: a } : null;
      }
      return null;
    }
    function lineOn(flags, geom) {
      return flags !== undefined && !((flags & (1 << 19)) && !(flags & (1 << 3))) &&
        (geom === undefined || !(geom & (1 << 12)) || !!(geom & (1 << 28)));
    }
    function strokeOf(s, kind) {
      var v = s.fopt.v, t = s.tert.v;
      var isLine = kind === 'line';
      var on = lineOn(v[0x1FF], v[0x17F]) || (isLine && v[0x1FF] === undefined);
      if (!on) return null;
      var st = null;
      if (v[0x1C0] !== undefined || isLine) {
        st = { color: v[0x1C0] !== undefined ? color(v[0x1C0]) : '#000000', width: v[0x1CB] !== undefined ? v[0x1CB] / EMU : 0.75 };
      } else if (lineOn(t[0x1FF])) {
        // Per-side borders (text boxes, table cells): use the first side that exists for all four.
        var sides = [[0x580, 0x58B, 0x5BF], [0x5C0, 0x5CB, 0x5FF], [0x600, 0x60B, 0x63F], [0x540, 0x54B, 0x57F]];
        for (var i = 0; i < 4 && !st; i++) {
          if (t[sides[i][0]] !== undefined && lineOn(t[sides[i][2]])) {
            st = { color: color(t[sides[i][0]]), width: t[sides[i][1]] !== undefined ? t[sides[i][1]] / EMU : 0.75 };
          }
        }
      }
      if (!st || st.width <= 0) return null;
      st.width = OP.round(st.width, 2);
      st.dash = DASH[v[0x1CE]] || 'solid';
      return st;
    }

    /**
     * BorderArt: the colour and width are in the per-side border properties (the drawing's own line is white).
     * A colour set by the user is stored as RGB; a scheme reference means the border keeps its own colours,
     * which Publisher's thumbnails show as black for the built-in borders, so that is drawn black.
     */
    function borderArtStroke(s) {
      var v = s.fopt.v, t = s.tert.v;
      var sides = [[0x540, 0x54B], [0x580, 0x58B], [0x5C0, 0x5CB], [0x600, 0x60B]];
      for (var i = 0; i < sides.length; i++) {
        var w = t[sides[i][1]], c = t[sides[i][0]];
        if (c !== undefined && w > 0) return { color: (c >>> 24) ? '#000000' : color(c), width: OP.round(w / EMU, 2), dash: 'solid' };
      }
      return v[0x1CB] > 0 ? { color: '#000000', width: OP.round(v[0x1CB] / EMU, 2), dash: 'solid' } : null;
    }

    function customPath(s) {
      var v = s.fopt.v, vd = s.fopt.c[0xC145], sd = s.fopt.c[0xC146];
      if (!vd || vd.length < 6) return null;
      var dv = new DataView(vd.buffer, vd.byteOffset, vd.byteLength);
      var num = dv.getUint16(0, true), esz = dv.getUint16(4, true);
      if (esz === 0xFFF0) esz = 4;
      if (esz !== 2 && esz !== 4 && esz !== 8) return null;
      var gl = (v[0x140] | 0) || 0, gt = (v[0x141] | 0) || 0;
      var gr = v[0x142] !== undefined ? (v[0x142] | 0) : 21600, gb = v[0x143] !== undefined ? (v[0x143] | 0) : 21600;
      var gw = (gr - gl) || 1, gh = (gb - gt) || 1, pts = [];
      for (var i = 0; i < num && 6 + (i + 1) * esz <= vd.length; i++) {
        var o = 6 + i * esz, x, y;
        if (esz === 2) { x = vd[o]; y = vd[o + 1]; }
        else if (esz === 4) { x = dv.getInt16(o, true); y = dv.getInt16(o + 2, true); }
        else { x = dv.getInt32(o, true); y = dv.getInt32(o + 4, true); }
        pts.push([(x - gl) / gw, (y - gt) / gh]);
      }
      if (pts.length < 2) return null;
      var cmds = [], closed = false, pi = 0;
      function next() { return pts[Math.min(pi++, pts.length - 1)]; }
      if (sd && sd.length >= 8) {
        var sv = new DataView(sd.buffer, sd.byteOffset, sd.byteLength), sn = sv.getUint16(0, true);
        for (var k = 0; k < sn && 6 + (k + 1) * 2 <= sd.length; k++) {
          var seg = sv.getUint16(6 + k * 2, true), type = seg >> 13, cnt = seg & 0x1FFF, j, p;
          if (type === 0) { for (j = 0; j < cnt && pi < pts.length; j++) { p = next(); cmds.push(['L', p[0], p[1]]); } }
          else if (type === 1) {
            for (j = 0; j < cnt && pi + 2 < pts.length + 1; j++) { var a = next(), b = next(), c = next(); cmds.push(['C', a[0], a[1], b[0], b[1], c[0], c[1]]); }
          } else if (type === 2) { p = next(); cmds.push(['M', p[0], p[1]]); }
          else if (type === 3) { cmds.push(['Z']); closed = true; }
          else if (type === 4) { break; }
          else if (type === 5) { pi += seg & 0xFF; }
        }
      }
      if (!cmds.length || cmds[0][0] !== 'M') {
        cmds = pts.map(function (p, idx) { return [idx ? 'L' : 'M', p[0], p[1]]; });
        var f = pts[0], l = pts[pts.length - 1];
        if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) { cmds.push(['Z']); closed = true; }
      }
      return { cmds: cmds, closed: closed };
    }

    /** Position an item given its Escher anchor (EMU, origin at page centre) and rotation. */
    function frame(s) {
      var a = s.abs, rot = s.fopt.v[0x0004] !== undefined ? mod(fixed(s.fopt.v[0x0004]), 360) : 0;
      var xs = a.xs, ys = a.ys, xe = a.xe, ye = a.ye;
      if ((rot >= 45 && rot < 135) || (rot >= 225 && rot < 315)) {
        // For quarter-turned shapes the anchor is the box of the *rotated* shape.
        var w0 = xe - xs, h0 = ye - ys, cx = xs + w0 / 2, cy = ys + h0 / 2;
        xs = cx - h0 / 2; ys = cy - w0 / 2; xe = xs + h0; ye = ys + w0;
      }
      var x = W / 2 + Math.min(xs, xe) / EMU, y = H / 2 + Math.min(ys, ye) / EMU;
      return { x: x, y: y, w: Math.abs(xe - xs) / EMU, h: Math.abs(ye - ys) / EMU, rot: OP.round(rot, 2) };
    }

    function convShape(s, groupId) {
      if (!s.abs) return [];
      var v = s.fopt.v, info = (s.seq !== null && pub.shapes[s.seq]) || {};
      var f = frame(s);
      var kind = KIND[s.type];
      var path = null;
      if (s.fopt.c[0xC145] && (s.type === 0 || s.type === 100 || !kind)) {
        path = customPath(s);
        if (path) kind = 'path';
      }
      var isWordArt = s.type >= 136 && s.type <= 175;
      if (!kind) {
        kind = 'rect';
        if (!isWordArt && s.type !== 0) note('Some AutoShapes have no equivalent here and were imported as rectangles.');
      }
      var pxId = v[0x4104];
      var it;
      if (pxId !== undefined && pxId > 0) {
        it = OP.newImage(assetFor(pxId), f.x, f.y, f.w, f.h);
        it.crop = {
          t: OP.clamp(fixed(v[0x100] || 0), 0, 0.95), b: OP.clamp(fixed(v[0x101] || 0), 0, 0.95),
          l: OP.clamp(fixed(v[0x102] || 0), 0, 0.95), r: OP.clamp(fixed(v[0x103] || 0), 0, 0.95)
        };
        it.stroke = strokeOf(s, 'rect');
        if (!it.asset) it.name = 'Picture (format not supported)';
      } else {
        it = OP.newShape(kind, f.x, f.y, f.w, f.h);
        if (path) it.path = path;
        it.fill = OP.isOpen(it) ? null : fillOf(s, false);
        it.stroke = info.borderArt ? borderArtStroke(s) : strokeOf(s, kind);
        if (info.borderArt && it.stroke) {
          // Publisher draws BorderArt inside the shape's edge; an outline is centred on it, so move it in by half its width
          var inset = Math.min(it.stroke.width / 2, it.w / 2, it.h / 2);
          it.x += inset; it.y += inset; it.w -= 2 * inset; it.h -= 2 * inset;
          it.name = 'BorderArt (plain frame)';
          note('BorderArt is shown as a plain frame in its colour and width: Publisher keeps its border pictures in the program, not in the file.');
        }
        if (kind === 'line') {
          it.arrowStart = !!v[0x1D0]; it.arrowEnd = !!v[0x1D1];
        }
        if (kind === 'roundrect' && v[0x147] !== undefined) it.radius = OP.round(Math.min(f.w, f.h) * OP.clamp((v[0x147] | 0) / 21600, 0, 0.5), 2);
      }
      it.rot = f.rot;
      it.flipH = !!(s.flags & 0x40); it.flipV = !!(s.flags & 0x80);
      it.group = groupId;
      var sh = v[0x23F];
      if (sh !== undefined && (sh & (1 << 17)) && (sh & 2)) {
        it.shadow = {
          dx: OP.round((v[0x205] !== undefined ? (v[0x205] | 0) : 0x6338) / EMU, 2),
          dy: OP.round((v[0x206] !== undefined ? (v[0x206] | 0) : 0x6338) / EMU, 2),
          blur: 0, color: color(v[0x201] !== undefined ? v[0x201] : 0x00808080)
        };
      }
      if (it.type !== 'shape') return [it];

      // WordArt keeps its text inside the drawing record
      if (isWordArt && s.fopt.c[0xC0C0]) {
        var wt = utf16(s.fopt.c[0xC0C0]).replace(/\r\n?/g, '\n');
        var wf = s.fopt.c[0xC0C5] ? utf16(s.fopt.c[0xC0C5]) : 'Arial';
        var gt = v[0xFF] || 0;
        if (!it.fill && !it.stroke) it.fill = { type: 'solid', color: '#000000' };
        if (it.fill && it.fill.type === 'image') it.fill = { type: 'solid', color: '#000000' };
        it.kind = 'rect'; delete it.path;
        // gtextAlign: 0 stretch each line, 1 centre (the default), 2 left, 3 right, 4/5 letter/word justify (stretched here)
        var ga = v[0xC2] === undefined ? 1 : v[0xC2];
        it.wa = { text: wt.replace(/\n+$/, ''), font: wf, b: !!(gt & 0x20), i: !!(gt & 0x10), warp: OP.WARP_OF_SHAPE[s.type] || 'plain',
          align: ga === 1 ? 'center' : ga === 2 ? 'left' : ga === 3 ? 'right' : 'stretch' };
        it.name = 'WordArt';
        return [it];
      }

      var story = storyFor(info.textId);
      if (info.table && story && story.cellEnds) return tableItems(it, info.table, story, s);
      if (story && story.paras.length) {
        var mg = function (id) { return OP.round((v[id] !== undefined ? v[id] : 36576) / EMU, 2); };
        var pad = [mg(0x81), mg(0x82), mg(0x83), mg(0x84)];
        var paras = takeText(story, it, info);
        it.text = OP.newText(paras);
        it.text.pad = pad;
        it.text.valign = info.valign === 1 ? 'middle' : info.valign === 2 ? 'bottom' : 'top';
        var ncol = s.tert.v[0x8C];
        if (ncol > 1 && ncol <= 8) { it.text.cols = ncol; it.text.gap = 12; }
      }
      return [it];
    }

    /** A Publisher table becomes one table item. */
    function tableItems(frameItem, t, story, s) {
      // paragraphs -> cells, by running character offset
      var cells = [], cur = [], off = 1, ci = 0;
      story.paras.forEach(function (p) {
        p.runs.forEach(function (r) { off += r.text.length; });
        cur.push(p);
        if (ci < story.cellEnds.length && off >= story.cellEnds[ci]) { cells.push(cur); cur = []; ci++; }
      });
      if (cur.length) cells.push(cur);
      var tb = OP.newTable(t.rows, t.cols, frameItem.x, frameItem.y, frameItem.w, frameItem.h);
      tb.rows = t.rowH.map(function (h) { return Math.max(1, h); });
      tb.cols = t.colW.map(function (w) { return Math.max(1, w); });
      tb.rot = frameItem.rot; tb.group = frameItem.group;
      var stroke = strokeOf(s, 'rect');
      tb.grid = stroke ? { color: stroke.color, width: stroke.width } : { color: '#000000', width: 0 };
      var bg = frameItem.fill && frameItem.fill.type === 'solid' ? frameItem.fill.color : null;
      var r, c, taken = [];
      for (r = 0; r < t.rows; r++) { taken.push([]); for (c = 0; c < t.cols; c++) { tb.cells[r][c] = null; taken[r].push(false); } }
      t.cells.forEach(function (cl, idx) {
        if (cl.c0 >= t.cols || cl.r0 >= t.rows || taken[cl.r0][cl.c0]) return;
        var c1 = Math.min(Math.max(cl.c1, cl.c0), t.cols - 1), r1 = Math.min(Math.max(cl.r1, cl.r0), t.rows - 1), i, j;
        for (i = cl.r0; i <= r1; i++) for (j = cl.c0; j <= c1; j++) if (taken[i][j]) { c1 = cl.c0; r1 = cl.r0; }
        var cell = OP.newCell(cells[idx] ? convParas(cells[idx]) : null);
        cell.cs = c1 - cl.c0 + 1; cell.rs = r1 - cl.r0 + 1; cell.fill = bg;
        tb.cells[cl.r0][cl.c0] = cell;
        for (i = cl.r0; i <= r1; i++) for (j = cl.c0; j <= c1; j++) taken[i][j] = true;
      });
      for (r = 0; r < t.rows; r++) for (c = 0; c < t.cols; c++) if (!taken[r][c]) { tb.cells[r][c] = OP.newCell(); tb.cells[r][c].fill = bg; }
      return [tb];
    }

    function convMember(m, groupId, out) {
      if (m.group) {
        var gid = groupId || OP.uid('g');
        var start = out.length;
        m.group.forEach(function (k) { convMember(k, gid, out); });
        var ld = m.leader;
        var rot = ld && ld.fopt.v[0x0004] !== undefined ? mod(fixed(ld.fopt.v[0x0004]), 360) : 0;
        var fh = ld && (ld.flags & 0x40), fv = ld && (ld.flags & 0x80);
        if (ld && ld.abs && (rot || fh || fv)) {
          var gx = W / 2 + (ld.abs.xs + ld.abs.xe) / 2 / EMU, gy = H / 2 + (ld.abs.ys + ld.abs.ye) / 2 / EMU;
          for (var i = start; i < out.length; i++) {
            var it = out[i], ix = it.x + it.w / 2, iy = it.y + it.h / 2;
            if (fh) { ix = 2 * gx - ix; it.flipH = !it.flipH; it.rot = mod(-it.rot, 360); }
            if (fv) { iy = 2 * gy - iy; it.flipV = !it.flipV; it.rot = mod(-it.rot, 360); }
            var p = OP.rotatePoint(ix, iy, gx, gy, rot);
            it.x = p.x - it.w / 2; it.y = p.y - it.h / 2; it.rot = OP.round(mod(it.rot + rot, 360), 2);
          }
        }
      } else if (m.shape) {
        convShape(m.shape, groupId).forEach(function (it) { out.push(it); });
      }
    }

    // ---- pages
    var bySeq = {};
    (function index(list) {
      list.forEach(function (m) {
        if (m.shape && m.shape.seq !== null) bySeq[m.shape.seq] = m.shape;
        if (m.group) index(m.group);
      });
    })(pub.drawn);

    function memberSeq(m) { return m.shape ? m.shape.seq : m.seq; }
    function itemsOfPage(pg) {
      var want = {}, out = [];
      pg.shapes.forEach(function (q) { want[q] = true; });
      pub.drawn.forEach(function (m) {
        var q = memberSeq(m);
        if (q !== null && q !== undefined && want[q]) convMember(m, null, out);
      });
      return out;
    }

    var order = pub.pageOrder.length ? pub.pageOrder.slice() : Object.keys(pub.pages).map(Number).sort(function (a, b) { return a - b; });
    var masterIds = {}; // Publisher master seq -> our master page
    order.forEach(function (seq) {
      var pg = pub.pages[seq];
      if (!pg || pg.isMaster || pg.dummy) return;
      var page = OP.newPage();
      var master = pg.master !== null ? pub.pages[pg.master] : null;
      if (master && master.isMaster) {
        var mp = masterIds[pg.master];
        if (mp === undefined) {
          var mi = itemsOfPage(master);
          mp = null;
          if (mi.length) {
            mp = OP.newPage();
            mp.name = 'Master ' + String.fromCharCode(65 + doc.masters.length);
            mp.items = mi;
            doc.masters.push(mp);
          }
          masterIds[pg.master] = mp;
        }
        if (mp) page.master = mp.id;
        if (master.bgShape !== null && bySeq[master.bgShape]) applyBg(page, bySeq[master.bgShape]);
      }
      var onMaster = {};
      if (page.master) doc.masters.forEach(function (m) { if (m.id === page.master) m.items.forEach(function (it) { onMaster[sameKey(it)] = true; }); });
      itemsOfPage(pg).forEach(function (it) {
        // some templates repeat a master object on the page; the copy draws exactly over it, so keep one
        if (onMaster[sameKey(it)]) return;
        page.items.push(it);
      });
      if (pg.bgShape !== null && bySeq[pg.bgShape]) applyBg(page, bySeq[pg.bgShape]);
      doc.pages.push(page);
    });
    /** Everything that shows, without ids and grouping, to spot an object repeated exactly. */
    function sameKey(it) {
      return JSON.stringify(it, function (k, val) {
        if (k === 'id' || k === 'group' || k === 'next' || k === 'name') return undefined;
        return typeof val === 'number' ? Math.round(val * 100) / 100 : val;
      });
    }
    function applyBg(page, s) {
      var f = fillOf(s, true);
      if (!f) return;
      if (f.type === 'solid') { page.bg = f.color; return; }
      var r = OP.newShape('rect', 0, 0, W, H);
      r.fill = f; r.stroke = null; r.locked = true; r.name = 'Page background';
      page.items.unshift(r);
    }

    linkStories();
    if (!doc.pages.length) { doc.pages.push(OP.newPage()); note('No pages were found in this file.'); }
    var count = 0;
    doc.pages.forEach(function (p) { count += p.items.length; });
    doc.masters.forEach(function (p) { count += p.items.length; });
    return { doc: doc, notes: notes, itemCount: count };
  };
})();
