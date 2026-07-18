/**
 * HavenLink - Resource Finder hero visual ("the survey draws itself").
 *
 * A surveyor's plate drafts itself over a faint graticule: nested contour
 * lines rise around a ridge, a terracotta home point is fixed with cross
 * ticks, dashed range rings sweep out ("10 / 25 / 50 mi"), three resource
 * stations are plotted with bearing lines - one annotated "2.4 mi · NE" -
 * and a north arrow finishes the plate. A coordinate readout ticks while
 * the pen works, then settles. Dwell: the home point breathes a warm glow
 * and the ring dashes drift. Self-contained 2D canvas (no CDN), DPR-aware,
 * pauses off-screen / when hidden, and renders one static fully-drawn frame
 * under reduced motion. Sits on the right of the hero; the CSS mask fades
 * its left edge behind the headline.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("rfSurvey");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var INK = "20,33,61";
  var TERRA = "180,85,31";

  var DRAW = 9, DWELL = 5.5, FADE = 1.6;
  var CYCLE = DRAW + DWELL + FADE;

  var strokes = [];
  var labels = [];
  var W = 0, H = 0, dpr = 1, t = 0;
  var homeX = 0, homeY = 0, plateR = 0, homeAt = 0;
  var raf = null, visible = true;

  function addStroke(pts, color, w, alpha, dash) {
    strokes.push({ pts: pts, color: color, w: w, alpha: alpha, dash: dash || null, len: 0, t0: 0, t1: 1 });
    return strokes.length - 1;
  }

  // labels fade in once the stroke at strokeIdx has finished drawing
  function addLabel(x, y, text, font, color, alpha, strokeIdx, align) {
    labels.push({ x: x, y: y, text: text, font: font, color: color, alpha: alpha, idx: strokeIdx, align: align || "left", at: 0 });
  }

  function arcPts(cx, cy, r, a0, a1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * (i / n);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }

  // Build the survey as an ordered list of polyline strokes - the order is the
  // order the pen drafts them: contours, home point, range rings, stations
  // with bearing lines, and the north arrow as the drafting flourish.
  function buildSurvey() {
    strokes = [];
    labels = [];

    var R = Math.min(Math.min(W, H) * 0.4, 300);
    if (R < 130) R = 130;
    var cx = Math.min(W * 0.72, W - R - 28);
    var cy = H * 0.46;
    homeX = cx;
    homeY = cy;
    plateR = R;

    // ---- nested contour loops around a ridge NW of the home point.
    // r(θ) = R0·s·(1 + Σ aᵢ·sin(nᵢθ+φᵢ)) with shared phases so the loops nest.
    var rx = cx - R * 0.38, ry = cy - R * 0.3;
    var PH1 = 0.9, PH2 = 2.2, PH3 = 4.1;
    var scales = [1, 0.84, 0.68, 0.52, 0.36];
    for (var c = 0; c < scales.length; c++) {
      var pts = [];
      var R0 = R * 0.62 * scales[c];
      for (var k = 0; k <= 90; k++) {
        var th = (k / 90) * Math.PI * 2;
        var rr = R0 * (1 +
          0.1 * Math.sin(2 * th + PH1) +
          0.07 * Math.sin(3 * th + PH2) +
          0.05 * Math.sin(5 * th + PH3));
        pts.push([rx + Math.cos(th) * rr, ry + Math.sin(th) * rr * 0.82]);
      }
      addStroke(pts, "ink", 1, 0.2 + c * 0.05);
    }

    // ---- the home point: ink ring + cross ticks ("you are here")
    var hr = 7;
    homeAt = addStroke(arcPts(cx, cy, hr, -Math.PI / 2, Math.PI * 1.5, 24), "ink", 1.3, 0.6);
    addStroke([[cx - hr - 7, cy], [cx - hr - 2, cy]], "ink", 1, 0.5);
    addStroke([[cx + hr + 2, cy], [cx + hr + 7, cy]], "ink", 1, 0.5);
    addStroke([[cx, cy - hr - 7], [cx, cy - hr - 2]], "ink", 1, 0.5);
    addStroke([[cx, cy + hr + 2], [cx, cy + hr + 7]], "ink", 1, 0.5);

    // ---- dashed range rings sweeping outward, each labelled at its NE azimuth
    var ringR = [R * 0.34, R * 0.63, R * 0.92];
    var ringLabel = ["10 mi", "25 mi", "50 mi"];
    for (var g = 0; g < ringR.length; g++) {
      var idx = addStroke(arcPts(cx, cy, ringR[g], -Math.PI / 2, Math.PI * 1.5, 72), "ink", 1, 0.34, [4, 5]);
      var lx = cx + Math.cos(-Math.PI / 4) * ringR[g];
      var ly = cy + Math.sin(-Math.PI / 4) * ringR[g];
      addLabel(lx + 5, ly - 5, ringLabel[g], '10px "Satoshi", system-ui, sans-serif', "ink", 0.5, idx);
    }

    // ---- three resource stations: thin bearing line out, terracotta triangle
    var stations = [
      { a: -0.85, d: R * 0.3, note: "2.4 mi · NE" },
      { a: 2.6, d: R * 0.55, note: null },
      { a: 0.35, d: R * 0.8, note: null },
    ];
    for (var s = 0; s < stations.length; s++) {
      var st = stations[s];
      var sx = cx + Math.cos(st.a) * st.d;
      var sy = cy + Math.sin(st.a) * st.d;
      addStroke([[cx + Math.cos(st.a) * (hr + 4), cy + Math.sin(st.a) * (hr + 4)], [sx, sy]], "ink", 1, 0.3);
      var tr = 5.5;
      var triIdx = addStroke(
        [[sx, sy - tr], [sx + tr * 0.87, sy + tr * 0.5], [sx - tr * 0.87, sy + tr * 0.5], [sx, sy - tr]],
        "terra", 1.3, 0.85
      );
      if (st.note) {
        addLabel(sx + 10, sy - 8, st.note, 'italic 12.5px "Fraunces", Georgia, serif', "terra", 0.95, triIdx);
      }
    }

    // ---- north arrow, top right of the plate
    var nx = cx + R * 0.78, ny = cy - R * 0.82;
    addStroke([[nx, ny + 20], [nx, ny - 2]], "ink", 1.2, 0.5);
    var nIdx = addStroke([[nx - 4.5, ny + 4], [nx, ny - 2], [nx + 4.5, ny + 4]], "ink", 1.2, 0.5);
    addLabel(nx, ny - 8, "N", '11px "Satoshi", system-ui, sans-serif', "ink", 0.55, nIdx, "center");

    // measure each stroke and hand it a sequential window of the draw phase
    var total = 0, i, m, p, l;
    for (i = 0; i < strokes.length; i++) {
      l = 0;
      p = strokes[i].pts;
      for (m = 1; m < p.length; m++) {
        l += Math.hypot(p[m][0] - p[m - 1][0], p[m][1] - p[m - 1][1]);
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
    for (i = 0; i < labels.length; i++) {
      labels[i].at = strokes[labels[i].idx].t1;
    }
  }

  // static surveyor's sheet: graticule, register crosses, edge degree ticks
  function drawSheet() {
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
    // register crosses at every 4th intersection
    ctx.strokeStyle = "rgba(" + INK + ",0.12)";
    for (x = sp * 4; x < W; x += sp * 4) {
      for (y = sp * 4; y < H; y += sp * 4) {
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
        ctx.stroke();
      }
    }
    // degree ticks along the top and right edges
    ctx.strokeStyle = "rgba(" + INK + ",0.18)";
    for (x = sp; x < W; x += sp) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, x % (sp * 4) === 0 ? 9 : 5);
      ctx.stroke();
    }
    for (y = sp; y < H; y += sp) {
      ctx.beginPath();
      ctx.moveTo(W, y);
      ctx.lineTo(W - (y % (sp * 4) === 0 ? 9 : 5), y);
      ctx.stroke();
    }
  }

  // Draw a stroke up to fraction f of its length; returns the pen tip when partial.
  function drawStroke(s2, f, dashDrift) {
    ctx.strokeStyle = "rgba(" + (s2.color === "terra" ? TERRA : INK) + "," + s2.alpha + ")";
    ctx.lineWidth = s2.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(s2.dash || []);
    ctx.lineDashOffset = s2.dash ? dashDrift : 0;
    var p = s2.pts;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    var tip = null;
    if (f >= 1) {
      for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.stroke();
    } else {
      var target = s2.len * f, acc = 0;
      tip = p[0];
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
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    return tip;
  }

  // coordinate readout, top right: ticks while the pen draws, then settles
  function drawReadout(p) {
    var jitter = (1 - p) * 0.35;
    var lat = 38.0608 + jitter * Math.sin(t * 7.3);
    var lng = 97.9298 + jitter * Math.cos(t * 5.9);
    ctx.font = '11px "Satoshi", system-ui, sans-serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(" + INK + ",0.5)";
    ctx.fillText(lat.toFixed(4) + "° N — " + lng.toFixed(4) + "° W", W - 18, 16);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
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
    drawSheet();

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);

    drawReadout(p);

    // the home point warms in as the survey completes, breathing on the dwell
    var glow = Math.max(0, (p - 0.55) / 0.45);
    if (glow > 0.01) {
      var gr = plateR * 0.5;
      var warm = glow * (0.06 + 0.05 * breathe);
      var grad = ctx.createRadialGradient(homeX, homeY, 0, homeX, homeY, gr);
      grad.addColorStop(0, "rgba(" + TERRA + "," + warm.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + TERRA + ",0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(homeX, homeY, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    // ring dashes drift almost imperceptibly during the dwell
    var drift = forceP == null && p >= 1 ? -(t * 1.6 % 90) : 0;

    var tip = null;
    for (var i = 0; i < strokes.length; i++) {
      var s2 = strokes[i];
      if (p >= s2.t1) {
        drawStroke(s2, 1, drift);
      } else if (p > s2.t0) {
        tip = drawStroke(s2, (p - s2.t0) / (s2.t1 - s2.t0), 0);
        break;
      } else {
        break;
      }
    }

    // the terracotta home dot fixes itself once its ring is inked
    var homeDone = strokes[homeAt] ? strokes[homeAt].t1 : 0;
    if (p >= homeDone) {
      var da = Math.min(1, (p - homeDone) / 0.04);
      ctx.fillStyle = "rgba(" + TERRA + "," + (0.9 * da).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(homeX, homeY, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // annotations surface as their strokes complete
    for (var n = 0; n < labels.length; n++) {
      var lb = labels[n];
      if (p <= lb.at) continue;
      var la = Math.min(1, (p - lb.at) / 0.06) * lb.alpha;
      ctx.font = lb.font;
      ctx.textAlign = lb.align;
      ctx.fillStyle = "rgba(" + (lb.color === "terra" ? TERRA : INK) + "," + la.toFixed(3) + ")";
      ctx.fillText(lb.text, lb.x, lb.y);
    }
    ctx.textAlign = "left";

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
    buildSurvey();
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
