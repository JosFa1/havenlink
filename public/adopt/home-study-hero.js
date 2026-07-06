/**
 * HavenLink — Home Study hero visual ("the blueprint draws itself").
 *
 * A top-down floor plan drafts itself in fine ink lines over a faint drafting
 * grid — outer walls with an entry gap, interior partitions with doorways, a
 * swinging entry door, window ticks, a terracotta hearth — then dwells while a
 * warm hearth glow breathes, fades out, and begins again. Self-contained 2D
 * canvas (no CDN), DPR-aware, pauses off-screen / when hidden, and renders one
 * static fully-drawn frame under reduced motion. Sits on the right of the
 * hero; the CSS mask fades its left edge behind the headline.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("hsBlueprint");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var INK = "20,33,61";
  var TERRA = "180,85,31";

  var DRAW = 9, DWELL = 5, FADE = 1.6;
  var CYCLE = DRAW + DWELL + FADE;

  var strokes = [];
  var W = 0, H = 0, dpr = 1, t = 0;
  var hearthX = 0, hearthY = 0, planR = 0;
  var raf = null, visible = true;

  function addStroke(pts, color, w, alpha) {
    strokes.push({ pts: pts, color: color, w: w, alpha: alpha, len: 0, t0: 0, t1: 1 });
  }

  function arcPts(cx, cy, r, a0, a1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * (i / n);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }

  // Build the floor plan as an ordered list of polyline strokes — the order is
  // the order the pen drafts them: walls, partitions, windows, door, dimension
  // lines, and the hearth as the warm finish.
  function buildPlan() {
    strokes = [];

    var s = Math.min(Math.min(W, H) * 0.62, 470);
    if (s < 190) s = 190;
    var hw = s * 0.5;
    var hh = s * 0.36;
    var cx = Math.min(W * 0.77, W - hw - 16);
    var cy = H * 0.43;
    var L = cx - hw, R = cx + hw, T = cy - hh, B = cy + hh;

    // entry gap in the south wall
    var doorW = s * 0.15;
    var d0 = cx - hw * 0.42;
    var d1 = d0 + doorW;

    // outer walls, one continuous pass from the entry gap around
    addStroke([[d1, B], [R, B], [R, T], [L, T], [L, B], [d0, B]], "ink", 1.4, 0.55);

    // interior partitions (doorway gaps left open)
    var px = L + (R - L) * 0.56;
    var gapC = T + (B - T) * 0.42, gapH = s * 0.12;
    addStroke([[px, T], [px, gapC - gapH / 2]], "ink", 1, 0.45);
    addStroke([[px, gapC + gapH / 2], [px, B]], "ink", 1, 0.45);

    var py = T + (B - T) * 0.52;
    var gxC = L + (px - L) * 0.55, gxW = s * 0.11;
    addStroke([[L, py], [gxC - gxW / 2, py]], "ink", 1, 0.45);
    addStroke([[gxC + gxW / 2, py], [px, py]], "ink", 1, 0.45);

    // window ticks — double parallel lines set into the walls
    function windowTicks(x0, y0, x1, y1) {
      var nx = y1 - y0, ny = -(x1 - x0);
      var nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      addStroke([[x0, y0], [x1, y1]], "ink", 1, 0.45);
      addStroke([[x0 + nx * 4, y0 + ny * 4], [x1 + nx * 4, y1 + ny * 4]], "ink", 1, 0.35);
    }
    var ww = s * 0.13;
    var wx1 = L + (R - L) * 0.24;
    windowTicks(wx1 - ww / 2, T, wx1 + ww / 2, T);
    var wx2 = L + (R - L) * 0.76;
    windowTicks(wx2 - ww / 2, T, wx2 + ww / 2, T);
    var wy1 = T + (B - T) * 0.26;
    windowTicks(L, wy1 - ww / 2, L, wy1 + ww / 2);

    // entry door: leaf swung into the room + swing arc (terracotta)
    var leafA = -Math.PI * 0.42;
    addStroke(
      [[d0, B], [d0 + Math.cos(leafA) * doorW, B + Math.sin(leafA) * doorW]],
      "terra", 1.2, 0.8
    );
    addStroke(arcPts(d0, B, doorW, leafA, 0, 14), "terra", 1, 0.55);

    // dimension lines with end ticks (drafting flourish)
    var dy = T - Math.min(26, hh * 0.3);
    addStroke([[L, dy - 5], [L, dy + 5]], "ink", 1, 0.28);
    addStroke([[L, dy], [R, dy]], "ink", 1, 0.22);
    addStroke([[R, dy - 5], [R, dy + 5]], "ink", 1, 0.28);
    var dx = L - Math.min(26, hw * 0.2);
    addStroke([[dx - 5, T], [dx + 5, T]], "ink", 1, 0.28);
    addStroke([[dx, T], [dx, B]], "ink", 1, 0.22);
    addStroke([[dx - 5, B], [dx + 5, B]], "ink", 1, 0.28);

    // the hearth, notched into the east wall — drawn last
    hearthX = R - s * 0.05;
    hearthY = T + (B - T) * 0.3;
    var hz = s * 0.055;
    addStroke(
      [[R, hearthY - hz], [R - hz * 1.6, hearthY - hz], [R - hz * 1.6, hearthY + hz], [R, hearthY + hz]],
      "terra", 1.2, 0.8
    );
    addStroke([[R - hz * 0.8, hearthY - hz * 0.45], [R - hz * 0.8, hearthY + hz * 0.45]], "terra", 1, 0.6);

    planR = s;

    // measure each stroke and hand it a sequential window of the draw phase
    var total = 0, i, k, p, l;
    for (i = 0; i < strokes.length; i++) {
      l = 0;
      p = strokes[i].pts;
      for (k = 1; k < p.length; k++) {
        l += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
      }
      strokes[i].len = l;
      total += l;
    }
    var acc = 0;
    for (i = 0; i < strokes.length; i++) {
      strokes[i].t0 = acc / total;
      acc += strokes[i].len;
      strokes[i].t1 = acc / total;
    }
  }

  function drawGrid() {
    var sp = 48, i, x, y;
    ctx.lineWidth = 1;
    for (x = sp, i = 0; x < W; x += sp, i++) {
      ctx.strokeStyle = "rgba(" + INK + "," + (i % 4 === 3 ? 0.06 : 0.035) + ")";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (y = sp, i = 0; y < H; y += sp, i++) {
      ctx.strokeStyle = "rgba(" + INK + "," + (i % 4 === 3 ? 0.06 : 0.035) + ")";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  // Draw a stroke up to fraction f of its length; returns the pen tip when partial.
  function drawStroke(s2, f) {
    ctx.strokeStyle = "rgba(" + (s2.color === "terra" ? TERRA : INK) + "," + s2.alpha + ")";
    ctx.lineWidth = s2.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var p = s2.pts;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    if (f >= 1) {
      for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
      return null;
    }
    var target = s2.len * f, acc = 0, tip = p[0];
    for (var k = 1; k < p.length; k++) {
      var a = p[k - 1], b = p[k];
      var l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + l >= target) {
        var m = l ? (target - acc) / l : 0;
        tip = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
        ctx.lineTo(tip[0], tip[1]);
        break;
      }
      ctx.lineTo(b[0], b[1]);
      acc += l;
      tip = b;
    }
    ctx.stroke();
    return tip;
  }

  function step(forceP) {
    var p, alpha = 1;
    var breathe = 0.5 + 0.5 * Math.sin(t * 1.1);
    if (forceP != null) {
      p = forceP;
      breathe = 0.5;
    } else {
      var ct = t % CYCLE;
      if (ct < DRAW) {
        p = ct / DRAW;
        p = p * p * (3 - 2 * p); // ease: deliberate start, calm finish
      } else if (ct < DRAW + DWELL) {
        p = 1;
      } else {
        p = 1;
        alpha = 1 - (ct - DRAW - DWELL) / FADE;
      }
    }

    ctx.clearRect(0, 0, W, H);
    drawGrid();

    ctx.save();
    if (forceP == null) {
      // subtle drift of the plan against the static grid
      ctx.translate(Math.sin(t * 0.1) * 3, Math.cos(t * 0.13) * 2);
    }
    ctx.globalAlpha = Math.max(0, alpha);

    // hearth glow warms in as the plan completes, breathing during the dwell
    var glow = Math.max(0, (p - 0.72) / 0.28);
    if (glow > 0.01) {
      var gr = planR * 0.55;
      var warm = glow * (0.06 + 0.05 * breathe);
      var grad = ctx.createRadialGradient(hearthX, hearthY, 0, hearthX, hearthY, gr);
      grad.addColorStop(0, "rgba(" + TERRA + "," + warm.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + TERRA + ",0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hearthX, hearthY, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    var tip = null;
    for (var i = 0; i < strokes.length; i++) {
      var s2 = strokes[i];
      if (p >= s2.t1) {
        drawStroke(s2, 1);
      } else if (p > s2.t0) {
        tip = drawStroke(s2, (p - s2.t0) / (s2.t1 - s2.t0));
        break;
      } else {
        break;
      }
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

  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPlan();
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

  resize();
  start();
})();
