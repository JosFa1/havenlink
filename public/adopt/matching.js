/**
 * HavenLink - Compatibility Matching hero visual ("the convergence").
 *
 * Two point-fields - families on one side, agencies on the other - drift on a
 * dark field and resonate into alignment: matched pairs link across a central
 * seam with a pulsing terracotta thread. The fields converge as the visitor
 * scrolls through the hero, surge when a match is rolled, and lock into a
 * steady resolved state once a match is confirmed:
 *   window event "havenlink:match-roll"  -> brief surge of resonance
 *   window event "havenlink:matched"     -> permanent convergence
 * (both dispatched by match-flow.js).
 *
 * Self-contained 2D canvas (no CDN), DPR-aware, pauses off-screen / when
 * hidden, and renders one static frame under reduced motion.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("mtResonance");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Drawn on the ink hero: paper points, lifted-terracotta threads.
  var DOT = "250,248,245";
  var TERRA = "217,119,66";

  var left = [], right = [], pairs = [];
  var W = 0, H = 0, dpr = 1, seam = 0, t = 0;
  var raf = null, visible = true;
  var conv = 0;      // scroll-driven convergence 0..1
  var surge = 0;     // spikes on match roll, decays
  var resolved = false; // true once a match is confirmed

  function rand(a, b) { return a + Math.random() * (b - a); }

  function field(cx, spread, count) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      arr.push({
        x: cx + rand(-spread, spread),
        y: rand(H * 0.12, H * 0.88),
        vx: rand(-0.09, 0.09),
        vy: rand(-0.09, 0.09),
        r: rand(0.8, 2.1),
        hx: cx,
        sy: rand(0.12, 0.88)
      });
    }
    return arr;
  }

  function build() {
    var per = W < 640 ? 9 : W < 1100 ? 14 : 18;
    seam = W * 0.62;
    left = field(W * 0.44, W * 0.09, per);
    right = field(W * 0.8, W * 0.08, per);
    pairs = [];
    var n = Math.min(left.length, right.length);
    var chance = resolved ? 0.85 : 0.5;
    for (var i = 0; i < n; i++) {
      if (Math.random() < chance) {
        pairs.push({ a: i, b: (i + ((Math.random() * n) | 0)) % n, ph: rand(0, Math.PI * 2) });
      }
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
    if (reduce) step();
  }

  // How strongly the two fields lean toward the seam right now (0..1).
  function convergence() {
    var c = conv + surge * 0.5 + (resolved ? 0.55 : 0);
    return c > 1 ? 1 : c;
  }

  function drift(arr, sign) {
    var c = convergence();
    for (var i = 0; i < arr.length; i++) {
      var n = arr[i];
      // home position slides toward the seam as convergence rises
      var hx = n.hx + (seam - sign * W * 0.045 - n.hx) * c * 0.7;
      n.vx += (hx - n.x) * 0.0006;
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= 0.99;
      n.vy *= 0.99;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      n.y = Math.max(0, Math.min(H, n.y));
    }
  }

  function linkField(arr, alphaScale) {
    var maxD = Math.min(W, H) * 0.2;
    for (var a = 0; a < arr.length; a++) {
      for (var b = a + 1; b < arr.length; b++) {
        var dx = arr[a].x - arr[b].x, dy = arr[a].y - arr[b].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < maxD) {
          var al = (1 - d / maxD) * alphaScale;
          ctx.strokeStyle = "rgba(" + DOT + "," + al.toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(arr[a].x, arr[a].y);
          ctx.lineTo(arr[b].x, arr[b].y);
          ctx.stroke();
        }
      }
    }
  }

  function dots(arr) {
    for (var i = 0; i < arr.length; i++) {
      ctx.fillStyle = "rgba(" + DOT + ",0.55)";
      ctx.beginPath();
      ctx.arc(arr[i].x, arr[i].y, arr[i].r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    ctx.clearRect(0, 0, W, H);
    t += 0.016;
    if (surge > 0.003) surge *= 0.985; else surge = 0;
    drift(left, 1);
    drift(right, -1);

    // seam
    ctx.strokeStyle = "rgba(" + DOT + ",0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(seam, H * 0.08);
    ctx.lineTo(seam, H * 0.92);
    ctx.stroke();

    linkField(left, 0.1);
    linkField(right, 0.12);

    // matched pairs resonate across the seam
    var boost = surge * 0.35 + (resolved ? 0.22 : 0);
    for (var i = 0; i < pairs.length; i++) {
      var la = left[pairs[i].a], rb = right[pairs[i].b];
      if (!la || !rb) continue;
      var pulse = 0.16 + boost + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.4 + pairs[i].ph));
      if (pulse > 0.75) pulse = 0.75;
      ctx.strokeStyle = "rgba(" + TERRA + "," + pulse.toFixed(3) + ")";
      ctx.lineWidth = resolved ? 1.25 : 1;
      ctx.beginPath();
      ctx.moveTo(la.x, la.y);
      ctx.lineTo(rb.x, rb.y);
      ctx.stroke();
      // node on the seam where they meet
      var mx = (la.x + rb.x) / 2, my = (la.y + rb.y) / 2;
      ctx.fillStyle = "rgba(" + TERRA + "," + (pulse + 0.2).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, resolved ? 2.3 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    dots(left);
    dots(right);
  }

  function loop() { step(); raf = requestAnimationFrame(loop); }
  function start() { if (raf == null && visible && !reduce) loop(); }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }

  // scroll through the hero pulls the fields together
  function onScroll() {
    if (!H) return;
    var y = window.scrollY || 0;
    var c = y / (H * 0.85);
    conv = c < 0 ? 0 : c > 1 ? 0.45 : c * 0.45;
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // the live match flow narrates into the canvas
  window.addEventListener("havenlink:match-roll", function () {
    surge = 1;
  });
  window.addEventListener("havenlink:matched", function () {
    if (!resolved) {
      resolved = true;
      surge = 1;
      build(); // more threads lock across the seam
      if (reduce) step();
    }
  });

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
  onScroll();
  start();
})();
