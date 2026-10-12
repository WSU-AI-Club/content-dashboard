/* @ds-bundle: {"format":4,"namespace":"AIClub","components":[{"name":"EventPost"},{"name":"SpeakerPost"},{"name":"GeneralPost"},{"name":"RecapPost"},{"name":"BlankPost"},{"name":"FinishedPost"},{"name":"TemplatePost"},{"name":"Tag"},{"name":"Button"}]} */
/*
 * AI Club brand templates, as plain React components (no JSX, no build step).
 *
 * Every graphic the desk makes is one of these components rendered at its real pixel size, then
 * photographed to PNG by html-to-image. The look lives in bundle.css; this file only decides
 * WHAT goes on the canvas and in which order. Officers change words and photos, never layout.
 *
 * All templates share one anatomy (see the brand guide, "Social templates"):
 *   header (logo + series eyebrow) -> main (kicker, headline, dek, media, data strip) -> footer
 */
(function () {
  var R = window.React, h = R.createElement;

  // Fallback logo paths for the design-system site; the desk overrides these with inlined copies
  // (window.AIClubLogos) so exports never wait on the network.
  var LOGO = {
    black: "/_blob/b446eba0f07ba22e6f15c735dc79be6c",
    white: "/_blob/8a5da564e2e15dae043811eb095db136"
  };

  // Canvas sizes in CSS pixels, i.e. the size each template is LAID OUT at.
  // Social formats are laid out at their real export size. The screen formats are laid out at a
  // 1080px-tall design size so type matches the feed, and the desk scales the PNG to the screen's
  // exact pixels on export (see OUT_SIZE in desk.html):
  //   tv     WSU TV          laid out 1920x1080, exported 1280x720   (16:9)
  //   bigtv  Woolsey Big TV  laid out 1920x1080, exported 1920x1080  (16:9)
  //   blast  Shockerblast    laid out 1440x1080, exported  800x600   (4:3)
  var SIZE = {
    feed: [1080, 1350], story: [1080, 1920], wide: [1200, 627],
    tv: [1920, 1080], bigtv: [1920, 1080], blast: [1440, 1080]
  };
  // Which formats are landscape screens, and their aspect class (used by bundle.css).
  var LAND = { tv: "aic-r169", bigtv: "aic-r169", blast: "aic-r43" };

  var SPARK = "M72 0C72 32 112 72 144 72C112 72 72 112 72 144C72 112 32 72 0 72C32 72 72 32 72 0Z";

  /* ---------- small helpers ---------- */
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }
  function words(s) { return (String(s || "").trim().match(/\S+/g) || []).length; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function norm(img) { return !img ? null : typeof img === "string" ? { src: img } : img; }
  function logos() { return window.AIClubLogos || LOGO; }

  function Spark() {
    return h("svg", { className: "aic-spark", viewBox: "0 0 144 144", "aria-hidden": "true", focusable: "false" }, h("path", { d: SPARK }));
  }

  /* ---------- QR codes ----------
   * A small QR encoder (byte mode, error correction level M, versions 1 to 20, so links up to
   * about 330 characters), written from the ISO/IEC 18004 algorithm as laid out in Project Nayuki's
   * public QR generator. It lives here, not on a server or CDN, so the preview and the PNG export
   * draw the code instantly and offline, and every graphic is scannable the moment it's made.
   * qrMatrix(text) returns rows of booleans (true = dark), or null if the text is too long. */
  var QR_ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];  // EC codewords per block, level M
  var QR_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];         // EC blocks, level M
  function qrRawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) { var n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function qrDataCodewords(v) { return Math.floor(qrRawModules(v) / 8) - QR_ECC[v] * QR_BLOCKS[v]; }
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  }
  function rsDivisor(deg) {
    var r = [], root = 1, i, j;
    for (i = 0; i < deg - 1; i++) r.push(0);
    r.push(1);
    for (i = 0; i < deg; i++) {
      for (j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= gfMul(c, f); });
    });
    return r;
  }
  function utf8(s) {
    var out = [], e = unescape(encodeURIComponent(s));
    for (var i = 0; i < e.length; i++) out.push(e.charCodeAt(i));
    return out;
  }
  function qrMatrix(text) {
    var bytes = utf8(String(text || "")), v, cap;
    for (v = 1; v < QR_ECC.length; v++) {
      cap = qrDataCodewords(v) * 8;
      if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (v >= QR_ECC.length) return null;
    // 1. data bits: byte mode, length, the bytes, terminator, then pad bytes
    var bits = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; data.push(b); }
    // 2. split into blocks, add Reed-Solomon error correction, interleave
    var nb = QR_BLOCKS[v], el = QR_ECC[v], raw = Math.floor(qrRawModules(v) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(el), blocks = [], at = 0;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(at, at + shortLen - el + (i < nShort ? 0 : 1));
      at += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var words = [];
    for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (bl, j) { if (i !== shortLen - el || j >= nShort) words.push(bl[i]); });
    // 3. the grid: function patterns first
    var size = v * 4 + 17, mod = [], fn = [], x, y;
    for (y = 0; y < size; y++) { mod.push([]); fn.push([]); for (x = 0; x < size; x++) { mod[y].push(false); fn[y].push(false); } }
    function setF(x, y, d) { mod[y][x] = d; fn[y][x] = true; }
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(cx0, cy0) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx0 + dx, yy = cy0 + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (v > 1) {
      var na = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2, pos = [6];
      for (var p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
      pos.forEach(function (ay, ai) {
        pos.forEach(function (ax, aj) {
          if ((ai === 0 && aj === 0) || (ai === 0 && aj === na - 1) || (ai === na - 1 && aj === 0)) return;
          for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        });
      });
    }
    function format(mask) {
      var d = mask, r = d; // level M's format bits are 00
      for (var i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var f = ((d << 10) | r) ^ 0x5412;
      function bit(i) { return ((f >>> i) & 1) === 1; }
      for (i = 0; i <= 5; i++) setF(8, i, bit(i));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
      for (i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
      for (i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
      setF(8, size - 8, true);
    }
    format(0);
    if (v >= 7) {
      var r = v;
      for (i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      var vb = (v << 12) | r;
      for (i = 0; i < 18; i++) { var d = ((vb >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); setF(a, c, d); setF(c, a, d); }
    }
    // 4. the codewords, in the zigzag order
    var n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        x = right - j; y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && n < words.length * 8) { mod[y][x] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) === 1; n++; }
      }
    }
    // 5. try all 8 masks and keep the one that scans most reliably (lowest penalty)
    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; }, function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; }, function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    function applyMask(m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; }
    function penalty() {
      var s = 0, dark = 0, x, y, run, line, k;
      var FP = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
      for (var pass = 0; pass < 2; pass++) for (var a = 0; a < size; a++) {
        line = [];
        for (var b = 0; b < size; b++) line.push(pass === 0 ? mod[a][b] : mod[b][a]);
        run = 1;
        for (k = 1; k <= size; k++) {
          if (k < size && line[k] === line[k - 1]) run++;
          else { if (run >= 5) s += run - 2; run = 1; }
        }
        for (k = 0; k + 11 <= size; k++) FP.forEach(function (pat) {
          for (var t = 0; t < 11; t++) if (line[k + t] !== (pat[t] === 1)) return;
          s += 40;
        });
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x < size - 1 && y < size - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) s += 3;
      }
      var total = size * size;
      return s + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    }
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); format(m);
      var pen = penalty();
      if (pen < bestP) { bestP = pen; best = m; }
      applyMask(m);
    }
    applyMask(best); format(best);
    return mod;
  }
  // The dark modules as one SVG path, one rectangle per horizontal run.
  function qrPath(m) {
    var d = "";
    m.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        if (!row[x]) continue;
        var s = x; while (x + 1 < row.length && row[x + 1]) x++;
        d += "M" + s + " " + y + "h" + (x - s + 1) + "v1h-" + (x - s + 1) + "z";
      }
    });
    return d;
  }

  // A photo slot. img = {src, x, y, zoom}: x/y are the focus point in % (object-position) and zoom
  // (1 to 3) scales around that point. data-slot lets the desk's editor drag, zoom and drop onto it.
  function Photo(p) {
    var im = norm(p.img) || {};
    var cls = cx("aic-photo", !im.src && "is-empty", p.bw && "is-bw", p.className);
    if (!im.src) return h("div", { className: cls, "data-slot": p.slot, "aria-hidden": "true" }, h("span", null, p.label || "Photo"));
    var x = num(im.x, 50), y = num(im.y, 50), z = Math.max(1, num(im.zoom, 1));
    return h("div", { className: cls, "data-slot": p.slot, role: "img", "aria-label": im.alt || p.alt || "" },
      h("img", { src: im.src, alt: "", draggable: false, style: { objectPosition: x + "% " + y + "%", transform: z !== 1 ? "scale(" + z + ")" : undefined, transformOrigin: x + "% " + y + "%" } }));
  }

  // The canvas. p.format picks the size; p.size ([w, h]) overrides it (used for "original size"
  // uploads). p.scale shrinks it for on-screen previews without changing the layout.
  function Frame(p, kind, children, extra) {
    var fmt = p.size ? "custom" : (SIZE[p.format] ? p.format : "feed");
    var s = p.size || SIZE[fmt], sc = p.scale || 1;
    var style = {};
    if (p.size) { style.width = s[0] + "px"; style.height = s[1] + "px"; }
    if (sc !== 1) style.transform = "scale(" + sc + ")";
    var qr = hasQR(p);
    var post = h("div", {
      className: cx("aic-post", "aic-" + fmt, LAND[fmt] && "aic-land", LAND[fmt], "aic-g-" + (p.ground === "ink" ? "ink" : "paper"), "aic-k-" + kind, qr && "aic-has-qr", qr && (p.meta || []).some(function (x) { return x && (x.label || x.value); }) && "aic-has-strip", extra, p.className),
      style: style,
      "data-format": fmt
    }, qr ? [].concat(children, h(QR, Object.assign({ key: "qr" }, p))) : children);
    return sc === 1 ? post : h("div", { className: "aic-fit", style: { width: Math.round(s[0] * sc), height: Math.round(s[1] * sc) } }, post);
  }

  /* ---------- shared pieces of the anatomy ---------- */
  function partnerList(p) { return (p.partners || []).filter(function (x) { return x && x.src; }).slice(0, 3); }
  function PLogos(p) {
    return partnerList(p).map(function (x, i) {
      return h("img", { key: i, className: cx("aic-plogo", x.tone && x.tone !== "original" && "is-" + x.tone), src: x.src, alt: x.name || "Partner logo" });
    });
  }
  // Header: our logo (white on black grounds), optional partner lockup, series eyebrow at right.
  function Head(p) {
    var L = logos(), src = p.logoSrc || (p.ground === "ink" ? L.white : L.black);
    var ours = h("img", { className: "aic-logo", src: src, alt: "AI Club, Wichita State University" });
    var lock = p.partnerPlace === "header" && partnerList(p).length
      ? h("div", { className: "aic-lockup" }, ours, h("span", { className: "aic-lock-rule", "aria-hidden": "true" }), PLogos(p))
      : ours;
    return h("header", { className: "aic-head" }, lock, p.series ? h("span", { className: "aic-eyebrow" }, p.series) : null);
  }
  function Kicker(p) {
    return p.kicker ? h("p", { className: "aic-kicker" }, h(Spark), h("span", null, p.kicker)) : null;
  }
  // Headlines over 8 words drop to the long size automatically.
  function Headline(p) {
    return p.headline ? h("h1", { className: cx("aic-h", words(p.headline) > 8 && "is-long") }, p.headline) : null;
  }
  // A blank line starts a new paragraph; a single line break stays a line break (white-space: pre-line).
  function Paras(text, cls) {
    return String(text || "").split(/\n\s*\n/).map(function (t) { return t.trim(); }).filter(Boolean)
      .map(function (t, i) { return h("p", { key: i, className: cls }, t); });
  }
  function Dek(p) { return p.dek ? Paras(p.dek, "aic-dek") : null; }
  // Data strip: 2 to 4 label/value cells (date, time, room...).
  function Strip(p) {
    var m = (p.meta || []).filter(function (x) { return x && (x.label || x.value); }).slice(0, 4);
    if (!m.length) return null;
    return h("dl", { className: "aic-strip", style: { "--n": m.length } }, m.map(function (x, i) {
      return h("div", { key: i, className: "aic-cell" }, h("dt", null, x.label), h("dd", null, x.value));
    }));
  }
  // Footer: partner logo row (unless they sit in the header), then call to action + slide counter.
  function Foot(p) {
    var partners = p.partnerPlace !== "header" && p.partnerPlace !== "none" && partnerList(p).length
      ? h("div", { key: "p", className: "aic-partners" }, h("span", null, p.partnerLabel || "In partnership with"), PLogos(p)) : null;
    // With a QR code, its label ("Scan to RSVP") takes the footer's right-hand end, after the slide counter.
    var right = [p.page, hasQR(p) ? (p.qrLabel == null ? "Scan to RSVP" : p.qrLabel) : ""].filter(Boolean).join(" · ");
    var foot = (p.cta || right) ? h("footer", { key: "f", className: "aic-foot" }, h("span", null, p.cta || ""), h("span", null, right)) : null;
    return partners || foot ? h(R.Fragment, null, partners, foot) : null;
  }
  // The QR code's dedicated place: the bottom-right corner, inside the margins, on every template and
  // every format. Black modules on an ivory tile with a quiet zone, so it scans on ivory, black and
  // photo grounds alike. Its label sits in the footer line, to its left. The canvas gets "aic-has-qr"
  // so bundle.css can move the data strip and footer out of its way.
  function hasQR(p) { return !!(p.qrOn && String(p.qr || "").trim()); }
  function QR(p) {
    if (!hasQR(p)) return null;
    var m = qrMatrix(String(p.qr).trim());
    if (!m) return h("div", { className: "aic-qr is-bad", "data-qr": "" }, h("span", null, "Link too long for a QR code"));
    var n = m.length, q = 3; // quiet zone in modules, drawn in ivory as part of the code
    return h("div", { className: "aic-qr", "data-qr": "" },
      h("svg", { viewBox: (-q) + " " + (-q) + " " + (n + 2 * q) + " " + (n + 2 * q), role: "img", "aria-label": "QR code: " + String(p.qr).trim(), shapeRendering: "crispEdges" },
        h("rect", { x: -q, y: -q, width: n + 2 * q, height: n + 2 * q, fill: "#F5F2EA" }),
        h("path", { d: qrPath(m), fill: "#0B0B0C" })));
  }

  // Full bleed: the photo covers the canvas under a dark scrim; type sits on it in ivory.
  function Bleed(p, kind, img, slot, inner) {
    p = Object.assign({}, p, { ground: "ink" });
    return Frame(p, kind, [
      h(Photo, { key: "bg", img: img, slot: slot, bw: p.bw, className: "aic-bg", label: "Full-bleed photo" }),
      h("div", { key: "s", className: "aic-scrim" }),
      h(Head, Object.assign({ key: "h" }, p)),
      h("div", { key: "m", className: "aic-main" }, inner),
      h(Foot, Object.assign({ key: "f" }, p))
    ], "aic-is-bleed");
  }

  /* ---------- the templates ---------- */

  // Workshops, project events, partner events: words only, black ground by default.
  function EventPost(p) {
    p = Object.assign({ ground: "ink" }, p);
    return Frame(p, "event", [
      h(Head, Object.assign({ key: "h" }, p)),
      h("div", { key: "m", className: "aic-main" },
        h("div", { className: "aic-copy" }, h(Kicker, p), h(Headline, p), h(Dek, p)),
        h(Strip, p)),
      h(Foot, Object.assign({ key: "f" }, p))
    ]);
  }

  // Speaker series, panels, workflow sessions: 1 to 4 black-and-white portraits.
  // One speaker can go full bleed.
  function SpeakerPost(p) {
    p = Object.assign({ ground: "paper", bw: true }, p);
    var sp = (p.speakers && p.speakers.length ? p.speakers : [{ name: p.name, role: p.role, photo: p.photo, photoAlt: p.photoAlt }]).filter(Boolean).slice(0, 4);
    var n = sp.length;
    if (p.bleed && n === 1) {
      var s0 = sp[0];
      return Bleed(p, "speaker", norm(s0.photo), "speakers.0", [
        h("div", { key: "c", className: "aic-copy" }, h(Kicker, p),
          s0.name ? h("p", { className: "aic-name" }, s0.name) : null,
          s0.role ? h("p", { className: "aic-role" }, s0.role) : null,
          h(Headline, p)),
        h(Strip, Object.assign({ key: "s" }, p))
      ]);
    }
    return Frame(p, "speaker", [
      h(Head, Object.assign({ key: "h" }, p)),
      h("div", { key: "m", className: "aic-main" },
        h("div", { className: "aic-speakers", style: { "--n": n } }, sp.map(function (s, i) {
          return h("div", { key: i, className: "aic-spk" },
            h(Photo, { img: norm(s.photo), slot: "speakers." + i, bw: p.bw, label: "Speaker photo", alt: s.photoAlt || ("Photo of " + (s.name || "the speaker")) }),
            s.name ? h("p", { className: "aic-name" }, s.name) : null,
            s.role ? h("p", { className: "aic-role" }, s.role) : null);
        })),
        h("div", { className: "aic-copy" }, h(Kicker, p), h(Headline, p)),
        h(Strip, p)),
      h(Foot, Object.assign({ key: "f" }, p))
    ], "aic-n-" + n);
  }

  // Session photos, club news, Open Floor, carousel slides.
  // layout: "photo" (one photo above the copy), "grid" (2 to 4), "full" (full bleed) or "text".
  function GeneralPost(p) {
    p = Object.assign({ ground: "paper", layout: "photo", bw: false }, p);
    var imgs = (p.images || []).map(norm), lay = p.layout;
    var copy = h("div", { key: "c", className: "aic-copy" }, h(Kicker, p), h(Headline, p), h(Dek, p));
    if (lay === "full") return Bleed(p, "general", imgs[0], "images.0", [copy, h(Strip, Object.assign({ key: "s" }, p))]);
    var media = null;
    if (lay === "photo") media = h(Photo, { img: imgs[0], slot: "images.0", bw: p.bw, className: "aic-media", label: "Photo" });
    if (lay === "grid") {
      var n = Math.min(Math.max(imgs.length, 2), 4), cells = [];
      for (var i = 0; i < n; i++) cells.push(h(Photo, { key: i, img: imgs[i], slot: "images." + i, bw: p.bw, label: "Photo " + (i + 1) }));
      media = h("div", { className: "aic-grid aic-grid-" + n }, cells);
    }
    return Frame(p, "general", [
      h(Head, Object.assign({ key: "h" }, p)),
      h("div", { key: "m", className: "aic-main" }, media, copy, h(Strip, p)),
      h(Foot, Object.assign({ key: "f" }, p))
    ], "aic-l-" + lay);
  }

  // Recaps: two to four real numbers after an event.
  function RecapPost(p) {
    p = Object.assign({ ground: "ink" }, p);
    var stats = (p.stats || []).filter(function (s) { return s && (s.value || s.label); }).slice(0, 4);
    return Frame(p, "recap", [
      h(Head, Object.assign({ key: "h" }, p)),
      h("div", { key: "m", className: "aic-main" },
        h("div", { className: "aic-copy" }, h(Kicker, p), h(Headline, p)),
        stats.length ? h("div", { className: cx("aic-stats", stats.length < 3 && "is-row") }, stats.map(function (s, i) {
          return h("div", { key: i, className: "aic-stat" }, h("b", null, s.value), h("span", null, s.label));
        })) : null),
      h(Foot, Object.assign({ key: "f" }, p))
    ]);
  }

  // A branded empty canvas: ground, optional ledger grid, header and footer. For finishing in Canva or Figma.
  function BlankPost(p) {
    p = Object.assign({ ground: "paper", grid: true, header: true }, p);
    return Frame(p, "blank", [
      p.header ? h(Head, Object.assign({ key: "h" }, p)) : null,
      h("div", { key: "m", className: "aic-main" }),
      h(Foot, Object.assign({ key: "f" }, p))
    ], p.grid ? null : "aic-nogrid");
  }

  // A finished graphic made somewhere else (Canva, Figma, a sponsor's file), posted as-is.
  // images[0] is the uploaded file. fit "cover" fills the chosen format and crops what doesn't fit
  // (drag to choose what stays); fit "contain" shows the whole graphic on the brand ground.
  // format "original" keeps the file's own pixel size.
  function FinishedPost(p) {
    var im = norm((p.images || [])[0]);
    var size = p.format === "original" ? (im && im.w ? [im.w, im.h] : [1080, 1350]) : null;
    var fit = p.fit === "contain" ? "contain" : "cover";
    return Frame(Object.assign({}, p, { size: size }), "finished", [
      h(Photo, { key: "g", img: im, slot: "images.0", className: cx("aic-bg", "aic-fit-" + fit), label: "Your graphic" })
    ], "aic-nogrid");
  }

  // A custom template the club uploaded: a background designed elsewhere, with brand type on top.
  // bg is {format: image}; a format without its own background borrows the main one (cover crop).
  // textPos: "bottom" | "center" | "top" | "none". ground picks the text color like everywhere else:
  // "paper" = dark text for light backgrounds, "ink" = ivory text for dark ones.
  function TemplatePost(p) {
    p = Object.assign({ ground: "ink", textPos: "bottom", header: true, scrim: false }, p);
    var bg = p.bg || {}, keys = Object.keys(bg).filter(function (k) { return bg[k]; });
    var fmtKey = SIZE[p.format] ? p.format : "feed";
    var useKey = bg[fmtKey] ? fmtKey : (bg[p.bgMain] ? p.bgMain : keys[0]);
    var pos = p.textPos;
    return Frame(p, "template", [
      h(Photo, { key: "bg", img: norm(useKey ? bg[useKey] : null), slot: "bg." + (useKey || fmtKey), className: "aic-bg", label: "Template background" }),
      p.scrim && pos !== "none" ? h("div", { key: "s", className: "aic-tscrim aic-tscrim-" + pos }) : null,
      p.header ? h(Head, Object.assign({ key: "h" }, p)) : null,
      pos === "none" ? h("div", { key: "m", className: "aic-main" }) :
        h("div", { key: "m", className: "aic-main" },
          h("div", { className: "aic-copy" }, h(Kicker, p), h(Headline, p), h(Dek, p)),
          h(Strip, p)),
      h(Foot, Object.assign({ key: "f" }, p))
    ], cx("aic-nogrid", "aic-pos-" + pos));
  }

  /* ---------- dashboard UI pieces ---------- */
  function Tag(p) {
    return h("span", { className: cx("aic-tag", "aic-tag-" + (p.tone || "neutral"), p.className) }, p.children);
  }

  function Button(p) {
    var rest = Object.assign({}, p);
    var variant = rest.variant || "secondary";
    delete rest.variant;
    rest.className = cx("aic-btn", "aic-btn-" + variant, p.className);
    if (!rest.type) rest.type = "button";
    return h("button", rest, p.children);
  }

  var api = {
    EventPost: EventPost, SpeakerPost: SpeakerPost, GeneralPost: GeneralPost, RecapPost: RecapPost, BlankPost: BlankPost,
    FinishedPost: FinishedPost, TemplatePost: TemplatePost,
    Tag: Tag, Button: Button, Photo: Photo, Spark: Spark, SIZES: SIZE, LANDSCAPE: LAND, LOGOS: LOGO,
    qrMatrix: qrMatrix
  };
  window.AIClub = Object.assign(window.AIClub || {}, api);
})();
