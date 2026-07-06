/**
 * HavenLink — Family Intake hero visual ("home from threads").
 *
 * A drifting field of points slowly gathers along the outline of a house — walls,
 * roof, a door — then relaxes and dissolves before re-forming, on a slow cinematic
 * loop. Near points link with faint ink threads that strengthen as the home takes
 * shape; a few terracotta threads pulse, and a soft hearth glow warms the doorway.
 * Self-contained 2D canvas (no CDN), DPR-aware, pauses off-screen / when hidden, and
 * renders one static "formed" frame under reduced motion. Sits on the right of the
 * hero; the CSS mask fades its left edge behind the headline.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("ikThreads");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var INK = "20,33,61";
  var TERRA = "180,85,31";

  var pts = [];
  var W = 0, H = 0, dpr = 1, t = 0;
  var cx = 0, hearthX = 0, hearthY = 0;
  var raf = null, visible = true;

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Build the house outline as line segments, then sample evenly-spaced targets
  // along its perimeter so the gathered points trace a clean home.
  function houseTargets(count) {
    var s = Math.max(Math.min(W, H) * 0.52, 200);
    s = Math.min(s, 460);
    cx = W * 0.72;
    var cy = H * 0.5;
    var hw = s * 0.42;            // half wall width
    var wallH = s * 0.5;          // wall height
    var roofH = s * 0.34;         // roof rise above the eaves

    var eaveY = cy - wallH * 0.5;
    var baseY = cy + wallH * 0.5;
    var apex = [cx, eaveY - roofH];
    var eaveL = [cx - hw, eaveY];
    var eaveR = [cx + hw, eaveY];
    var botL = [cx - hw, baseY];
    var botR = [cx + hw, baseY];

    // door
    var dw = hw * 0.36;
    var doorTop = baseY - wallH * 0.62;
    var doorL = [cx - dw / 2, baseY];
    var doorTL = [cx - dw / 2, doorTop];
    var doorTR = [cx + dw / 2, doorTop];
    var doorR = [cx + dw / 2, baseY];

    // window (upper-left pane)
    var wq = hw * 0.3;
    var wx = cx - hw * 0.5, wy = eaveY + wallH * 0.28;
    var w1 = [wx - wq / 2, wy - wq / 2], w2 = [wx + wq / 2, wy - wq / 2];
    var w3 = [wx + wq / 2, wy + wq / 2], w4 = [wx - wq / 2, wy + wq / 2];

    hearthX = cx;
    hearthY = (doorTop + baseY) / 2;

    var segs = [
      [apex, eaveL], [apex, eaveR],   // roof
      [eaveL, botL], [eaveR, botR],   // walls
      [botL, doorL], [doorR, botR],   // floor (split by door)
      [doorL, doorTL], [doorTL, doorTR], [doorTR, doorR], // door frame
      [w1, w2], [w2, w3], [w3, w4], [w4, w1]              // window
    ];

    var lens = [], total = 0;
    for (var i = 0; i < segs.length; i++) {
      var a = segs[i][0], b = segs[i][1];
      var l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      lens.push(l);
      total += l;
    }

    var out = [];
    for (var k = 0; k < count; k++) {
      var d = (k / count) * total, si = 0;
      while (si < segs.length - 1 && d > lens[si]) { d -= lens[si]; si++; }
      var f = lens[si] ? d / lens[si] : 0;
      var p0 = segs[si][0], p1 = segs[si][1];
      out.push({
        x: p0[0] + (p1[0] - p0[0]) * f + rand(-2, 2),
        y: p0[1] + (p1[1] - p0[1]) * f + rand(-2, 2)
      });
    }
    return out;
  }

  function build() {
    var count = W < 640 ? 46 : W < 1100 ? 66 : 84;
    var targets = houseTargets(count);
    pts = [];
    for (var i = 0; i < count; i++) {
      var bx = rand(W * 0.5, W * 0.97);
      var by = rand(H * 0.08, H * 0.92);
      pts.push({
        bx: bx, by: by,
        ph: rand(0, Math.PI * 2),
        amp: rand(W * 0.02, W * 0.06),
        hx: targets[i].x, hy: targets[i].y,
        x: bx, y: by, vx: 0, vy: 0,
        r: rand(0.9, 2.1),
        terra: Math.random() < 0.16
      });
    }
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
    build();
    if (reduce) step(1);
  }

  // 0 (dissolved) -> 1 (home fully formed), dwelling near each extreme.
  function gather() {
    var raw = 0.5 - 0.5 * Math.cos((t / 15) * Math.PI * 2);
    return raw * raw * (3 - 2 * raw);
  }

  function step(forceG) {
    var g = forceG != null ? forceG : gather();
    ctx.clearRect(0, 0, W, H);

    // update positions
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var fx = p.bx + Math.cos(t * 0.25 + p.ph) * p.amp;
      var fy = p.by + Math.sin(t * 0.31 + p.ph * 1.3) * p.amp;
      var tx = fx + (p.hx - fx) * g;
      var ty = fy + (p.hy - fy) * g;
      p.vx = (p.vx + (tx - p.x) * 0.02) * 0.84;
      p.vy = (p.vy + (ty - p.y) * 0.02) * 0.84;
      p.x += p.vx;
      p.y += p.vy;
    }

    // hearth glow through the doorway as the home forms
    if (g > 0.02) {
      var gr = Math.min(W, H) * 0.16;
      var grad = ctx.createRadialGradient(hearthX, hearthY, 0, hearthX, hearthY, gr);
      var warm = (0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.1))) * g;
      grad.addColorStop(0, "rgba(" + TERRA + "," + warm.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + TERRA + ",0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hearthX, hearthY, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    // threads between nearby points; stronger as the home forms
    var maxD = Math.min(W, H) * 0.19;
    var linkA = 0.05 + 0.16 * g;
    for (var a = 0; a < pts.length; a++) {
      for (var b = a + 1; b < pts.length; b++) {
        var dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < maxD) {
          var terra = pts[a].terra && pts[b].terra;
          var al = (1 - d / maxD) * linkA;
          if (terra) {
            var pulse = 0.5 + 0.5 * Math.sin(t * 1.5 + pts[a].ph);
            ctx.strokeStyle = "rgba(" + TERRA + "," + (al * (0.6 + 0.8 * pulse) + 0.04).toFixed(3) + ")";
            ctx.lineWidth = 1.1;
          } else {
            ctx.strokeStyle = "rgba(" + INK + "," + al.toFixed(3) + ")";
            ctx.lineWidth = 1;
          }
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        }
      }
    }

    // points
    for (var j = 0; j < pts.length; j++) {
      var q = pts[j];
      if (q.terra) {
        ctx.fillStyle = "rgba(" + TERRA + "," + (0.5 + 0.35 * g).toFixed(3) + ")";
      } else {
        ctx.fillStyle = "rgba(" + INK + "," + (0.4 + 0.25 * g).toFixed(3) + ")";
      }
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
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
