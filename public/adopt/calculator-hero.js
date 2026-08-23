/**
 * HavenLink - Financial Calculator hero visual ("the specimen worksheet").
 *
 * A worksheet fills itself in. The sheet is already printed - a guilloche
 * rosette watermark, faint ruled lines, the vertical money rule, register
 * corners - and the pen does the rest: a header, three cost lines whose
 * figures count up as they are written, a sub-rule, two credits entered in
 * terracotta, a double rule, and a net that lands in Fraunces under a
 * terracotta underline. An annotation notes that the real answer is a range,
 * and SPECIMEN overprints the foot so nobody reads the sample arithmetic as
 * their own number.
 *
 * The specimen adds up on purpose (38,000 + 4,200 + 2,600 = 44,800;
 * 17,670 + 5,000 = 22,670; net 22,130). The federal credit is the real 2026
 * maximum from src/data/calculator/tax_constants.json.
 *
 * Money out is ink and money back is terracotta - deliberately NOT the
 * --fc-out / --fc-back red-green pair, which stays semantic and is never spent
 * on decoration.
 *
 * Same machinery as resources-hero.js: self-contained 2D canvas (no CDN),
 * DPR-aware, DRAW -> DWELL -> FADE cycle, pauses off-screen / when hidden, and
 * renders one static fully-drawn frame under reduced motion. Sits on the right
 * of the hero; the shared .ed-hero-canvas mask fades its left edge behind the
 * headline.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("fcWorksheet");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var INK = "20,33,61";
  var TERRA = "180,85,31";

  var DRAW = 9.5, DWELL = 6, FADE = 1.6;
  var CYCLE = DRAW + DWELL + FADE;

  var ops = [];
  var sheet = null;          // static furniture, rebuilt on resize
  var W = 0, H = 0, dpr = 1, t = 0, u = 1;
  var plateX = 0, plateY = 0, netMark = null;
  var raf = null, visible = true;

  /* ------------------------------------------------------------------ money */

  var NUM = typeof Intl !== "undefined" && Intl.NumberFormat
    ? new Intl.NumberFormat("en-US")
    : null;

  function money(v) {
    var n = Math.abs(Math.round(v));
    return NUM ? NUM.format(n) : String(n);
  }

  function easeOut(f) { return 1 - Math.pow(1 - f, 3); }

  /* ------------------------------------------------------------------- text */

  function fnt(px, italic, serif) {
    return (italic ? "italic " : "") + px.toFixed(1) + "px " +
      (serif ? '"Fraunces", Georgia, serif' : '"Satoshi", system-ui, sans-serif');
  }

  // Letter-spaced text, drawn glyph by glyph so the pen can type it on and so
  // we never depend on ctx.letterSpacing (too new to rely on).
  function trackedWidth(str, track) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += ctx.measureText(str[i]).width + track;
    return w - (str.length ? track : 0);
  }

  function drawTracked(str, x, y, track, align, limit) {
    var n = limit == null ? str.length : Math.min(str.length, Math.ceil(limit));
    if (n <= 0) return;
    var cx = x;
    if (align === "right") cx = x - trackedWidth(str, track);
    else if (align === "center") cx = x - trackedWidth(str, track) / 2;
    for (var i = 0; i < n; i++) {
      ctx.fillText(str[i], cx, y);
      cx += ctx.measureText(str[i]).width + track;
    }
  }

  /* -------------------------------------------------------------------- ops */

  function rule(pts, color, w, alpha, dash, cost) {
    var len = 0;
    for (var i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    ops.push({ kind: "rule", pts: pts, color: color, w: w, alpha: alpha,
               dash: dash || null, len: len, cost: cost == null ? len : cost });
  }

  function label(str, x, y, font, color, alpha, align, track, cost) {
    ops.push({ kind: "text", str: str, x: x, y: y, font: font, color: color,
               alpha: alpha, align: align || "left", track: track || 0,
               cost: cost == null ? 9 * u * str.length : cost });
  }

  function figure(value, x, y, font, color, prefix, cost) {
    ops.push({ kind: "figure", value: value, x: x, y: y, font: font, color: color,
               prefix: prefix || "", cost: cost == null ? 95 * u : cost });
  }

  /* ------------------------------------------------------------------ build */

  // How far right the hero copy actually reaches, measured from the canvas's
  // own left edge. Element boxes are no use here - .ed-hero-actions and the
  // headline are full-width blocks - so this measures the text runs themselves.
  function copyRight() {
    var host = canvas.parentNode;
    if (!host || !document.createRange) return W;
    var nodes = host.querySelectorAll(
      ".ed-hero-eyebrow, .ed-hero-title, .ed-hero-standfirst, .ed-hero-actions");
    var base = canvas.getBoundingClientRect().left;
    var right = 0;
    for (var i = 0; i < nodes.length; i++) {
      var range = document.createRange();
      range.selectNodeContents(nodes[i]);
      var rects = range.getClientRects();
      for (var k = 0; k < rects.length; k++) {
        if (rects[k].width) right = Math.max(right, rects[k].right - base);
      }
    }
    return right;
  }

  function buildSheet() {
    ops = [];
    netMark = null;
    sheet = null;
    if (!W || !H) return;

    // The ledger is only drawn where it fits beside the copy without touching
    // it. When the hero stacks - phones, and anything narrow enough that the
    // sheet would shrink past legibility - it stays blank instead: engraving,
    // serial number and the SPECIMEN overprint, which is texture rather than a
    // second column of figures behind body text.
    var margin = Math.max(16, W * 0.03);
    var gap = Math.max(30, W * 0.03);
    var room = W - copyRight() - gap - margin;
    var PW = Math.min(room, 430, W * 0.46);
    var bare = PW < 300;
    if (bare) PW = Math.min(W * 0.78, 330);
    u = PW / 430;

    var pad = 26 * u;
    if (bare) {
      buildBareSheet(PW, pad, margin);
      return;
    }

    var rowH = 30 * u;
    var colW = 104 * u;
    var moneyX = PW - pad;          // figures right-align here
    var colX = moneyX - colW;       // the vertical money rule
    var labelX = pad;
    var y = pad + 14 * u;

    var labelFont = fnt(11.5 * u, false, false);
    var figFont = fnt(15 * u, false, false);
    var track = 1.15 * u;

    // ---- header: ESTIMATE - WORKSHEET .................... No. 05
    label("ESTIMATE · WORKSHEET", labelX, y, labelFont, "ink", 0.62, "left", track * 1.6);
    label("No. 05", moneyX, y, fnt(14 * u, true, true), "ink", 0.5, "right", 0);
    y += 12 * u;
    rule([[labelX, y], [moneyX, y]], "ink", 1.2, 0.42);
    y += rowH;

    var costs = [["AGENCY PROGRAM FEE", 38000], ["LEGAL & COURT", 4200], ["TRAVEL", 2600]];
    var backs = [["FEDERAL TAX CREDIT", 17670], ["EMPLOYER BENEFIT", 5000]];

    function row(text, value, color, neg) {
      ctx.font = labelFont;
      var lw = trackedWidth(text, track);
      label(text, labelX, y, labelFont, "ink", 0.72, "left", track);
      // dot leader: a dashed rule with round caps reads as printed dots
      var from = labelX + lw + 8 * u;
      var to = colX - 8 * u;
      if (to > from) {
        rule([[from, y - 3 * u], [to, y - 3 * u]], "ink", 1.1, 0.3,
             [1, 4.5 * u], (to - from) * 0.5);
      }
      figure(value, moneyX, y, figFont, color, neg ? "−" : "");
      y += rowH;
    }

    var i;
    for (i = 0; i < costs.length; i++) row(costs[i][0], costs[i][1], "ink", false);

    // ---- sub-rule under the costs (no subtotal printed - just the rule)
    y -= rowH * 0.42;
    rule([[colX, y], [moneyX, y]], "ink", 1, 0.34);
    y += rowH * 0.76;

    for (i = 0; i < backs.length; i++) row(backs[i][0], backs[i][1], "terra", true);

    // ---- double rule: also where the ledger's ruling stops
    y -= rowH * 0.44;
    rule([[colX, y], [moneyX, y]], "ink", 1.2, 0.5);
    rule([[colX, y + 3.5 * u], [moneyX, y + 3.5 * u]], "ink", 1.2, 0.5);
    var ruledBottom = y + 3.5 * u;
    y += rowH * 0.5 + 34 * u;

    // ---- the net
    var netFont = fnt(34 * u, false, true);
    label("NET", labelX, y - 4 * u, labelFont, "ink", 0.72, "left", track);
    figure(22130, moneyX, y, netFont, "ink", "$", 150 * u);
    ctx.font = netFont;
    var netW = ctx.measureText("$22,130").width;
    netMark = { x0: moneyX - netW, x1: moneyX, y: y + 9 * u };
    rule([[netMark.x0, netMark.y], [netMark.x1, netMark.y]], "terra", 1.6, 0.85);

    // ---- annotation: the real answer is a range, bracketed by hand
    var ay = y + 32 * u;
    var noteFont = fnt(13 * u, true, true);
    rule([[colX - 2 * u, ay - 9 * u], [colX + 7 * u, ay - 9 * u]], "terra", 1.1, 0.6, null, 16 * u);
    rule([[colX - 2 * u, ay - 9 * u], [colX - 2 * u, ay + 4 * u]], "terra", 1.1, 0.6, null, 16 * u);
    label("a range, once we", colX + 12 * u, ay, noteFont, "terra", 0.85, "left", 0);
    label("know your state", colX + 12 * u, ay + 16 * u, noteFont, "terra", 0.85, "left", 0);

    // ---- SPECIMEN overprint across the foot
    var sy = ay + 50 * u;
    label("SPECIMEN", PW / 2, sy, fnt(13 * u, false, false), "terra", 0.42, "center", 9 * u, 150 * u);

    place({ w: PW, h: sy + pad, pad: pad, colX: colX, rowH: rowH,
            top: pad + 14 * u, ruledBottom: ruledBottom, bare: false }, margin);
  }

  // The blank sheet: engraved, serialled, overprinted, and nothing else.
  function buildBareSheet(PW, pad, margin) {
    var PH = PW * 0.8;
    var y = pad + 14 * u;
    label("No. 05", PW - pad, y, fnt(14 * u, true, true), "ink", 0.5, "right", 0);
    y += 12 * u;
    rule([[pad, y], [PW - pad, y]], "ink", 1.2, 0.36);
    label("SPECIMEN", PW / 2, PH - pad, fnt(13 * u, false, false), "terra", 0.42,
          "center", 9 * u, 220 * u);
    place({ w: PW, h: PH, pad: pad, colX: 0, rowH: 0, top: y, ruledBottom: 0, bare: true },
          margin);
  }

  // Anchor the sheet on the right of the hero and hand every op a sequential
  // window of the draw phase, weighted by cost.
  function place(s, margin) {
    plateX = Math.max(8, W - s.w - margin);
    plateY = Math.max(20, (H - s.h) / 2);
    sheet = s;

    var total = 0, j;
    for (j = 0; j < ops.length; j++) total += ops[j].cost;
    if (!total) return;
    var acc = 0;
    for (j = 0; j < ops.length; j++) {
      ops[j].t0 = acc / total;
      acc += ops[j].cost;
      ops[j].t1 = acc / total;
    }
  }

  /* --------------------------------------------------- the pre-printed sheet */

  // Guilloche rosette: engine-turned line-work of the kind engraved on
  // banknotes and share certificates. Rings of overlapping circles for the
  // lace, scalloped closed curves for the borders. Every pass is bounded by R,
  // so the watermark can never wander off the sheet.
  function drawRosette(cx, cy, R) {
    ctx.lineWidth = 1;

    // two rings of overlapping circles - the lace
    var rings = [
      { n: 30, ring: 0.55, r: 0.45, col: INK, a: 0.04 },
      { n: 20, ring: 0.36, r: 0.3, col: INK, a: 0.035 }
    ];
    for (var g = 0; g < rings.length; g++) {
      var q = rings[g];
      ctx.strokeStyle = "rgba(" + q.col + "," + q.a + ")";
      ctx.beginPath();
      for (var i = 0; i < q.n; i++) {
        var a = (i / q.n) * Math.PI * 2;
        var x = cx + Math.cos(a) * R * q.ring;
        var y = cy + Math.sin(a) * R * q.ring;
        ctx.moveTo(x + R * q.r, y);
        ctx.arc(x, y, R * q.r, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    // scalloped borders - r(t) = R(1 + k sin(mt)), the engine-turned edge
    var borders = [
      { rad: 0.92, m: 44, k: 0.035, col: TERRA, a: 0.035 },
      { rad: 0.2, m: 24, k: 0.09, col: TERRA, a: 0.04 }
    ];
    for (var b = 0; b < borders.length; b++) {
      var o = borders[b];
      ctx.strokeStyle = "rgba(" + o.col + "," + o.a + ")";
      ctx.beginPath();
      for (var k = 0; k <= 360; k++) {
        var th = (k / 360) * Math.PI * 2;
        var rr = R * o.rad * (1 + o.k * Math.sin(o.m * th));
        var px = cx + Math.cos(th) * rr;
        var py = cy + Math.sin(th) * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  function drawFurniture() {
    var s = sheet;

    // clipped to the sheet: printing never runs off the paper
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, s.w, s.h);
    ctx.clip();
    drawRosette(s.w * 0.5, s.h * 0.46, Math.min(s.w, s.h) * 0.45);
    ctx.restore();

    if (!s.bare) {
      // ruled lines, stopping where the ledger's arithmetic does
      ctx.strokeStyle = "rgba(" + INK + ",0.045)";
      ctx.lineWidth = 1;
      for (var y = s.top + s.rowH; y < s.ruledBottom; y += s.rowH) {
        ctx.beginPath();
        ctx.moveTo(s.pad, y);
        ctx.lineTo(s.w - s.pad, y);
        ctx.stroke();
      }

      // the money rule
      ctx.strokeStyle = "rgba(" + INK + ",0.13)";
      ctx.beginPath();
      ctx.moveTo(s.colX, s.top - 6 * u);
      ctx.lineTo(s.colX, s.ruledBottom);
      ctx.stroke();
    }

    // register corners
    var L = 11 * u, m = 6 * u;
    ctx.strokeStyle = "rgba(" + INK + ",0.2)";
    ctx.lineWidth = 1.2;
    var corners = [[m, m, 1, 1], [s.w - m, m, -1, 1],
                   [m, s.h - m, 1, -1], [s.w - m, s.h - m, -1, -1]];
    for (var c = 0; c < corners.length; c++) {
      var q = corners[c];
      ctx.beginPath();
      ctx.moveTo(q[0] + q[2] * L, q[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.lineTo(q[0], q[1] + q[3] * L);
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ render */

  // Draw a rule up to fraction f of its length; returns the pen tip when partial.
  function drawRule(o, f) {
    ctx.strokeStyle = "rgba(" + (o.color === "terra" ? TERRA : INK) + "," + o.alpha + ")";
    ctx.lineWidth = o.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(o.dash || []);
    var p = o.pts;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    var tip = null;
    if (f >= 1) {
      for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
    } else {
      var target = o.len * f, acc = 0;
      tip = p[0];
      for (var k = 1; k < p.length; k++) {
        var a = p[k - 1], b = p[k];
        var l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc + l >= target) {
          var mm = l ? (target - acc) / l : 0;
          tip = [a[0] + (b[0] - a[0]) * mm, a[1] + (b[1] - a[1]) * mm];
          ctx.lineTo(tip[0], tip[1]);
          break;
        }
        ctx.lineTo(b[0], b[1]);
        acc += l;
        tip = b;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    return tip;
  }

  function drawOp(o, f) {
    if (o.kind === "rule") return drawRule(o, f);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    if (o.kind === "text") {
      ctx.font = o.font;
      ctx.fillStyle = "rgba(" + (o.color === "terra" ? TERRA : INK) + "," + o.alpha + ")";
      drawTracked(o.str, o.x, o.y, o.track, o.align, f >= 1 ? null : o.str.length * f);
      return null;
    }

    // figure: counts up over its own window, right-aligned on the money rule
    ctx.font = o.font;
    ctx.fillStyle = "rgba(" + (o.color === "terra" ? TERRA : INK) + ",0.92)";
    var v = f >= 1 ? o.value : Math.round((o.value * easeOut(f)) / 10) * 10;
    ctx.textAlign = "right";
    ctx.fillText(o.prefix + money(v), o.x, o.y);
    ctx.textAlign = "left";
    return null;
  }

  function step(forceP) {
    var p, alpha = 1;
    if (forceP != null) {
      p = forceP;
    } else {
      var ct = t % CYCLE;
      if (ct < DRAW) {
        p = ct / DRAW;
        p = p * p * (3 - 2 * p); // deliberate start, calm finish
      } else if (ct < DRAW + DWELL) {
        p = 1;
      } else {
        p = 1;
        alpha = 1 - (ct - DRAW - DWELL) / FADE;
      }
    }

    ctx.clearRect(0, 0, W, H);
    if (!sheet) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(plateX, plateY);

    drawFurniture();

    var tip = null;
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (p >= o.t1) {
        drawOp(o, 1);
      } else if (p > o.t0) {
        tip = drawOp(o, (p - o.t0) / (o.t1 - o.t0));
        break;
      } else {
        break;
      }
    }

    // on the dwell the net underline breathes at its ends - the whisper of the
    // tide plate's two boundaries, no more than that
    if (netMark && p >= 1 && forceP == null) {
      var b = Math.sin(t * 0.9) * 1.6;
      ctx.strokeStyle = "rgba(" + TERRA + ",0.85)";
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(netMark.x0 - b, netMark.y);
      ctx.lineTo(netMark.x1 + b, netMark.y);
      ctx.stroke();
    }

    // the pen itself
    if (tip && forceP == null && p < 1) {
      ctx.fillStyle = "rgba(" + TERRA + ",0.9)";
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /* --------------------------------------------------------------- lifecycle */

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildSheet();
    if (reduce) step(1);
  }

  function loop() { t += 0.016; step(); raf = requestAnimationFrame(loop); }
  function start() { if (raf == null && visible && !reduce) loop(); }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }

  if ("ResizeObserver" in window) {
    new ResizeObserver(function () { resize(); }).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.01 }).observe(canvas);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  // The animated path repaints every frame and heals itself when the webfonts
  // land; the reduced-motion path draws exactly once, so it has to wait.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { resize(); });
  }

  resize();
  start();
})();
