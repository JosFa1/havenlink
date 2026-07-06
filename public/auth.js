/* HavenLink auth pages — "loom" scene: vertical threads drift down the ink
   panel and part around a ring of light (the threshold). Companion to the
   homepage threads hero, rotated into a doorway. Everything is null-checked
   and the loop pauses when hidden or off-screen. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReduced = reduceMotion.matches;
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function (e) {
      prefersReduced = e.matches;
    });
  }

  var canvas = document.getElementById("auLoom");
  var scene = canvas ? canvas.parentElement : null;
  if (!canvas || !scene || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var PAPER = "250, 248, 245";
  var TERRA = "217, 138, 91";
  var SAMPLES = 56;
  var threads = [];
  var W = 0;
  var H = 0;
  var ringX = 0;
  var ringY = 0;
  var ringR = 0;
  var rafId = null;
  var lastTs = 0;
  var elapsed = 0;
  var sceneVisible = true;
  var canHover = window.matchMedia("(hover: hover)").matches;

  // pointer influence, lerped for a soft settling response
  var pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function buildThreads() {
    threads = [];
    var count = W <= 560 ? 10 : 17;
    for (var i = 0; i < count; i++) {
      var isTerra = i % 4 === 2; // ~25% terracotta accents
      var lane = 0.07 + (i / (count - 1)) * 0.86 + rand(-0.015, 0.015);
      threads.push({
        lane: lane,
        side: lane >= 0.5 ? 1 : -1, // fixed side, so parting never flickers
        phase: rand(0, Math.PI * 2),
        amp1: rand(8, 20),
        amp2: rand(4, 11),
        f1: rand(0.004, 0.007),
        f2: rand(0.011, 0.017),
        s1: rand(0.1, 0.2) * (i % 2 ? 1 : -1),
        s2: rand(0.16, 0.32),
        color: isTerra ? TERRA : PAPER,
        alpha: isTerra ? rand(0.3, 0.55) : rand(0.1, 0.28),
        width: i === 5 || i === 12 ? 1.6 : rand(0.6, 1.2)
      });
    }
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = scene.clientWidth;
    H = scene.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ringX = W * 0.5;
    ringY = H * 0.38; /* statement sits at the panel foot — keep the ring clear */
    ringR = Math.min(W, H) * 0.15;
    buildThreads();
    if (prefersReduced || rafId === null) drawFrame(elapsed || 8.2);
  }

  function drawFrame(t) {
    ctx.clearRect(0, 0, W, H);

    var breathe = 1 + 0.03 * Math.sin(t * 0.5);
    var clearance = ringR * 1.35 * breathe;
    var falloff = ringR * 1.7;

    for (var i = 0; i < threads.length; i++) {
      var th = threads[i];
      var laneX = th.lane * W;
      var pts = [];

      for (var s = 0; s < SAMPLES; s++) {
        var y = (s / (SAMPLES - 1)) * H;
        var noise =
          th.amp1 * Math.sin(y * th.f1 + t * th.s1 + th.phase) +
          th.amp2 * Math.sin(y * th.f2 + t * th.s2 + th.phase * 1.7);
        var x = laneX + noise;

        // part around the ring: hyperbolic avoidance of the vertical axis
        // through the ring center, faded by a gaussian in y
        var dy = y - ringY;
        var g = Math.exp(-(dy * dy) / (2 * falloff * falloff));
        if (g > 0.004) {
          var dx = x - ringX;
          var d = Math.abs(dx);
          var side = d < 1 ? th.side : dx / d;
          var avoided = ringX + side * Math.sqrt(d * d + clearance * clearance * 0.92);
          x = x * (1 - g) + avoided * g;
        }

        if (canHover) {
          var px = x - pointer.x;
          var py = y - pointer.y;
          var pd = Math.sqrt(px * px + py * py);
          if (pd < 160) {
            var push = Math.pow(1 - pd / 160, 2) * 18;
            x += px >= 0 ? push : -push;
          }
        }
        pts.push(x);
      }

      ctx.beginPath();
      ctx.strokeStyle = "rgba(" + th.color + ", " + th.alpha + ")";
      ctx.lineWidth = th.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      var step = H / (SAMPLES - 1);
      ctx.moveTo(pts[0], 0);
      for (var k = 1; k < SAMPLES - 1; k++) {
        var yc = (k * step + (k + 1) * step) / 2;
        var xc = (pts[k] + pts[k + 1]) / 2;
        ctx.quadraticCurveTo(pts[k], k * step, xc, yc);
      }
      ctx.lineTo(pts[SAMPLES - 1], H);
      ctx.stroke();
    }

    // the threshold: a still paper ring, a terracotta arc slowly circling it
    var r = ringR * breathe;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(" + PAPER + ", 0.4)";
    ctx.lineWidth = 1;
    ctx.arc(ringX, ringY, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(228, 183, 154, 0.85)";
    ctx.lineWidth = 1.6;
    var a0 = t * 0.22;
    ctx.arc(ringX, ringY, r, a0, a0 + Math.PI * 0.55);
    ctx.stroke();

    // faint halo just outside the ring
    ctx.beginPath();
    ctx.strokeStyle = "rgba(" + PAPER + ", " + (0.08 + 0.04 * Math.sin(t * 0.5)) + ")";
    ctx.lineWidth = 1;
    ctx.arc(ringX, ringY, r * 1.12, 0, Math.PI * 2);
    ctx.stroke();
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(ts - lastTs, 50) / 1000;
    lastTs = ts;
    elapsed += dt;

    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    drawFrame(elapsed);
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId !== null || prefersReduced || !sceneVisible || document.hidden) return;
    lastTs = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  if (canHover) {
    scene.addEventListener("pointermove", function (e) {
      var rect = scene.getBoundingClientRect();
      pointer.tx = e.clientX - rect.left;
      pointer.ty = e.clientY - rect.top;
      if (pointer.x < -999) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
    });
    scene.addEventListener("pointerleave", function () {
      pointer.tx = -9999;
      pointer.ty = -9999;
    });
  }

  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function () { resize(); });
    ro.observe(scene);
  } else {
    window.addEventListener("resize", resize);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      sceneVisible = entries[0].isIntersecting;
      if (sceneVisible) startLoop();
      else stopLoop();
    }).observe(scene);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function (e) {
      if (e.matches) {
        stopLoop();
        drawFrame(8.2); // hand-picked static frame
      } else {
        startLoop();
      }
    });
  }

  resize();
  if (prefersReduced) {
    drawFrame(8.2);
  } else {
    startLoop();
  }
})();
