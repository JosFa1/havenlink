/* HavenLink homepage-only behavior: threads hero canvas and the pinned
   "How It Works" chapter driver. Shared behavior (nav state, reveals,
   count-up) lives in editorial.js. Everything is null-checked - the SPA
   fallback can serve index.html on unexpected routes. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReduced = reduceMotion.matches;
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function (e) {
      prefersReduced = e.matches;
    });
  }

  /* ---------- Pinned "How It Works" chapters ---------- */

  var stage = document.querySelector(".hm-hiw-stage");
  var track = document.querySelector(".hm-hiw-track");
  var pinQuery = window.matchMedia("(min-width: 901px)");
  var trackTop = 0;
  var pinRange = 1;

  function measureTrack() {
    if (!track || !stage) return;
    var rect = track.getBoundingClientRect();
    trackTop = rect.top + window.scrollY;
    pinRange = Math.max(track.offsetHeight - stage.offsetHeight, 1);
  }

  function updateChapters() {
    if (!track || !stage || !pinQuery.matches || prefersReduced) return;
    var p = (window.scrollY - trackTop) / pinRange;
    p = Math.max(0, Math.min(1, p));
    var step = Math.min(3, Math.floor(p * 4));
    if (stage.getAttribute("data-step") !== String(step)) {
      stage.setAttribute("data-step", String(step));
    }
    stage.style.setProperty("--hiw-p", p.toFixed(4));
  }

  var scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      updateChapters();
    });
  }

  measureTrack();
  updateChapters();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    measureTrack();
    updateChapters();
  });
  // fonts/images settling can shift the track's document offset
  window.addEventListener("load", function () {
    measureTrack();
    updateChapters();
  });

  /* ---------- Generative threads hero ---------- */

  var canvas = document.getElementById("hmThreads");
  var hero = canvas ? canvas.parentElement : null;
  if (!canvas || !hero || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var INK = "20, 33, 61";
  var TERRA = "180, 85, 31";
  var SAMPLES = 64;
  var threads = [];
  var W = 0;
  var H = 0;
  var rafId = null;
  var lastTs = 0;
  var elapsed = 0;
  var heroVisible = true;
  var canHover = window.matchMedia("(hover: hover)").matches;

  // pointer influence, lerped for a soft, settling response
  var pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function buildThreads() {
    threads = [];
    var count = W <= 768 ? 10 : 22;
    for (var i = 0; i < count; i++) {
      var isTerra = i % 4 === 2; // ~25% terracotta
      var lead = i === 3 || i === 11;
      threads.push({
        lane: 0.08 + (i / (count - 1)) * 0.84 + rand(-0.02, 0.02),
        phase: rand(0, Math.PI * 2),
        braidPhase: (i % 6) * (Math.PI / 3),
        amp1: rand(10, 26),
        amp2: rand(6, 16),
        amp3: rand(3, 8),
        f1: rand(0.0035, 0.006),
        f2: rand(0.008, 0.013),
        f3: rand(0.018, 0.026),
        s1: rand(0.1, 0.22) * (i % 2 ? 1 : -1),
        s2: rand(0.14, 0.3),
        s3: rand(0.2, 0.42) * (i % 3 ? 1 : -1),
        color: isTerra ? TERRA : INK,
        alpha: isTerra ? rand(0.35, 0.7) : rand(0.18, 0.42),
        width: lead ? 1.8 : rand(0.7, 1.4)
      });
    }
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = hero.clientWidth;
    H = hero.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildThreads();
    if (prefersReduced || rafId === null) drawFrame(elapsed || 13.7);
  }

  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function drawFrame(t) {
    ctx.clearRect(0, 0, W, H);

    var scrollP = Math.max(0, Math.min(1, window.scrollY / Math.max(H, 1)));
    var parallaxY = window.scrollY * 0.3;
    var anchorX = W * 0.72;
    var anchorY = H * 0.48;
    var weaveBoost = 1 + 0.4 * scrollP;

    for (var i = 0; i < threads.length; i++) {
      var th = threads[i];
      var laneY = th.lane * H;
      var pts = [];

      for (var s = 0; s < SAMPLES; s++) {
        var x = (s / (SAMPLES - 1)) * W;
        var noise =
          th.amp1 * Math.sin(x * th.f1 + t * th.s1 + th.phase) +
          th.amp2 * Math.sin(x * th.f2 + t * th.s2 + th.phase * 1.7) +
          th.amp3 * Math.sin(x * th.f3 + t * th.s3);
        var braid = 14 * Math.sin(x * 0.02 + t * 0.25 + th.braidPhase);
        var w = smoothstep(0.35, 0.95, x / W) * 0.85 * weaveBoost;
        if (w > 1) w = 1;
        var y = (laneY + noise) * (1 - w) + (anchorY + braid) * w;

        if (canHover) {
          var dx = x - pointer.x;
          var dy = y + parallaxY - pointer.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 180) {
            var push = Math.pow(1 - d / 180, 2) * 22;
            y += dy >= 0 ? push : -push;
          }
        }
        pts.push(y + parallaxY);
      }

      ctx.beginPath();
      ctx.strokeStyle = "rgba(" + th.color + ", " + th.alpha + ")";
      ctx.lineWidth = th.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      var step = W / (SAMPLES - 1);
      ctx.moveTo(0, pts[0]);
      for (var k = 1; k < SAMPLES - 1; k++) {
        var xc = (k * step + (k + 1) * step) / 2;
        var yc = (pts[k] + pts[k + 1]) / 2;
        ctx.quadraticCurveTo(k * step, pts[k], xc, yc);
      }
      ctx.lineTo(W, pts[SAMPLES - 1]);
      ctx.stroke();
    }
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
    if (rafId !== null || prefersReduced || !heroVisible || document.hidden) return;
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
    hero.addEventListener("pointermove", function (e) {
      var rect = hero.getBoundingClientRect();
      pointer.tx = e.clientX - rect.left;
      pointer.ty = e.clientY - rect.top;
      if (pointer.x < -999) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
    });
    hero.addEventListener("pointerleave", function () {
      pointer.tx = -9999;
      pointer.ty = -9999;
    });
  }

  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function () { resize(); });
    ro.observe(hero);
  } else {
    window.addEventListener("resize", resize);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) startLoop();
      else stopLoop();
    }).observe(hero);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function (e) {
      if (e.matches) {
        stopLoop();
        drawFrame(13.7); // hand-picked static weave
      } else {
        startLoop();
      }
    });
  }

  resize();
  if (prefersReduced) {
    drawFrame(13.7);
  } else {
    startLoop();
  }
})();
