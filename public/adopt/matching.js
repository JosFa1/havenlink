/**
 * HavenLink — Compatibility Matching hero visual.
 *
 * Two point-fields — families on one side, children on the other — drift toward a
 * central seam and resonate into alignment: matched pairs link across the seam with
 * a pulsing terracotta thread. Self-contained 2D canvas (no CDN), DPR-aware, pauses
 * off-screen / when hidden, and renders one static frame under reduced motion.
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

  var INK = "20,33,61";
  var TERRA = "180,85,31";

  var left = [], right = [], pairs = [];
  var W = 0, H = 0, dpr = 1, seam = 0, t = 0;
  var raf = null, visible = true;

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
    for (var i = 0; i < n; i++) {
      if (Math.random() < 0.5) {
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

  function drift(arr) {
    for (var i = 0; i < arr.length; i++) {
      var n = arr[i];
      n.vx += (n.hx - n.x) * 0.0006;
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
          ctx.strokeStyle = "rgba(" + INK + "," + al.toFixed(3) + ")";
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
      ctx.fillStyle = "rgba(" + INK + ",0.5)";
      ctx.beginPath();
      ctx.arc(arr[i].x, arr[i].y, arr[i].r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    ctx.clearRect(0, 0, W, H);
    t += 0.016;
    drift(left);
    drift(right);

    // seam
    ctx.strokeStyle = "rgba(" + INK + ",0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(seam, H * 0.08);
    ctx.lineTo(seam, H * 0.92);
    ctx.stroke();

    linkField(left, 0.16);
    linkField(right, 0.18);

    // matched pairs resonate across the seam
    for (var i = 0; i < pairs.length; i++) {
      var la = left[pairs[i].a], rb = right[pairs[i].b];
      if (!la || !rb) continue;
      var pulse = 0.14 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.4 + pairs[i].ph));
      ctx.strokeStyle = "rgba(" + TERRA + "," + pulse.toFixed(3) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(la.x, la.y);
      ctx.lineTo(rb.x, rb.y);
      ctx.stroke();
      // node on the seam where they meet
      var mx = (la.x + rb.x) / 2, my = (la.y + rb.y) / 2;
      ctx.fillStyle = "rgba(" + TERRA + "," + (pulse + 0.2).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    dots(left);
    dots(right);
  }

  function loop() { step(); raf = requestAnimationFrame(loop); }
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
