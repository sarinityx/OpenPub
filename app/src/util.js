/* OpenPub – small shared helpers. */
var OP = (typeof globalThis.OP !== 'undefined') ? globalThis.OP : (globalThis.OP = {});

(function () {
  'use strict';

  /** zlib-inflate a byte array (browser + Node 18+). */
  OP.inflate = function (bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot decompress data'));
    var ds = new DecompressionStream('deflate');
    var blob = new Blob([bytes]);
    return new Response(blob.stream().pipeThrough(ds)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  };

  /** zlib-deflate a byte array (the format PDF's FlateDecode expects). */
  OP.deflate = function (bytes) {
    if (typeof CompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot compress data'));
    return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  };

  OP.bytesToBase64 = function (bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  };
  OP.bytesToDataUrl = function (bytes, mime) { return 'data:' + mime + ';base64,' + OP.bytesToBase64(bytes); };
  OP.dataUrlToBytes = function (url) {
    var i = url.indexOf(','), head = url.slice(0, i), body = url.slice(i + 1);
    if (/;base64/i.test(head)) {
      var bin = atob(body), out = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(body));
  };
  OP.dataUrlMime = function (url) { var m = /^data:([^;,]+)/.exec(url); return m ? m[1] : ''; };

  var uidN = 0;
  OP.uid = function (prefix) {
    uidN++;
    return (prefix || 'i') + Date.now().toString(36) + uidN.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  };
  OP.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  OP.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  OP.MM = 72 / 25.4; // points per millimetre
  OP.round = function (v, d) { var k = Math.pow(10, d === undefined ? 2 : d); return Math.round(v * k) / k; };
  OP.escXml = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
})();
