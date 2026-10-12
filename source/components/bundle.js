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
    var post = h("div", {
      className: cx("aic-post", "aic-" + fmt, LAND[fmt] && "aic-land", LAND[fmt], "aic-g-" + (p.ground === "ink" ? "ink" : "paper"), "aic-k-" + kind, extra, p.className),
      style: style,
      "data-format": fmt
    }, children);
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
    var foot = (p.cta || p.page) ? h("footer", { key: "f", className: "aic-foot" }, h("span", null, p.cta || ""), h("span", null, p.page || "")) : null;
    return partners || foot ? h(R.Fragment, null, partners, foot) : null;
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
    Tag: Tag, Button: Button, Photo: Photo, Spark: Spark, SIZES: SIZE, LANDSCAPE: LAND, LOGOS: LOGO
  };
  window.AIClub = Object.assign(window.AIClub || {}, api);
})();
