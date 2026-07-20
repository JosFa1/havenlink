/**
 * HavenLink - Compatibility Matching visual ("the constellation atlas").
 *
 * Agencies as a pseudo-3D field of stars: a slowly rotating point cloud,
 * hand-projected onto a 2D canvas (strict CSP - no CDNs, no WebGL). Two
 * instances of the same engine:
 *   #mtAtlasHero    - ink stars on the paper hero; scrolling through the hero
 *                     tilts the field and pulls it into focus
 *   #mtAtlasChamber - paper stars inside the ink match chamber; narrates the
 *                     live flow (match-flow.js) via window events:
 *     "havenlink:match-roll" -> surge of motion and brightness
 *     "havenlink:matched"    -> one partner star ignites and draws a
 *                               terracotta thread to the record anchor
 *
 * Mouse parallax on hover-capable devices, DPR-aware (capped at 2), pauses
 * off-screen / when hidden, renders a single static frame under reduced motion.
 */
(function () {
  "use strict";

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover =
    window.matchMedia && window.matchMedia("(hover: hover)").matches;

  // Mirrors the six HavenLink partner agencies (src/match/agencies.ts) -
  // purely aesthetic; the star-field never calls the API.
  var PARTNER_STARS = 6;

  var LIGHT = { star: "20,33,61", accent: "180,85,31", baseAlpha: 0.55, edgeAlpha: 0.08 };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOut(v) { return 1 - Math.pow(1 - v, 3); }

  function createAtlas(canvas, opts) {
    if (!canvas) return null;
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var pal = opts.palette;
    var stars = [], edges = [], proj = [];
    var W = 0, H = 0, dpr = 1;
    var t = rand(0, 90); // desync the two instances
    var raf = null, visible = true;
    var scrollTilt = 0, conv = 0;         // scroll-driven tilt + convergence
    var mouseTX = 0, mouseTY = 0;         // parallax targets
    var mouseX = 0, mouseY = 0;           // lerped parallax
    var surge = 0;                        // spikes on match roll, decays
    var resolved = false;                 // true once a match is confirmed
    var ignitedIdx = -1, igniteT = 0;     // the chosen star + its reveal 0..1

    function build() {
      var n = Math.round(W * H * opts.density);
      n = Math.max(60, Math.min(opts.maxStars, n));
      stars = [];
      for (var i = 0; i < n; i++) {
        // uniform point in a unit ball, mostly flattened into a spheroid
        var th = rand(0, Math.PI * 2);
        var cp = rand(-1, 1);
        var sp = Math.sqrt(1 - cp * cp);
        var rr = Math.cbrt(Math.random());
        var y = rr * cp;
        if (Math.random() > 0.35) y *= 0.55;
        var kind = i < PARTNER_STARS ? 2 : Math.random() < 0.08 ? 1 : 0;
        stars.push({
          x: rr * sp * Math.cos(th),
          y: y,
          z: rr * sp * Math.sin(th),
          r: kind === 2 ? rand(1.6, 2.2) : rand(0.6, 1.9),
          tw: rand(0.5, 1.6),
          ph: rand(0, Math.PI * 2),
          kind: kind
        });
      }
      // constellation edges precomputed in 3D so they rotate coherently;
      // short + sparse so they read as constellations, not a net
      edges = [];
      var deg = new Array(n).fill(0);
      for (var a = 0; a < n && edges.length < 100; a++) {
        if (deg[a] >= 2) continue;
        for (var b = a + 1; b < n && edges.length < 100; b++) {
          if (deg[b] >= 2) continue;
          var dx = stars[a].x - stars[b].x;
          var dy = stars[a].y - stars[b].y;
          var dz = stars[a].z - stars[b].z;
          if (dx * dx + dy * dy + dz * dz < 0.3 * 0.3) {
            edges.push({ a: a, b: b });
            deg[a]++;
            deg[b]++;
            if (deg[a] >= 2) break;
          }
        }
      }
      proj = new Array(n);
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

    function project(rotY, rotX, R, cx, cy) {
      var cyo = Math.cos(rotY), syo = Math.sin(rotY);
      var cxo = Math.cos(rotX), sxo = Math.sin(rotX);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var x1 = s.x * cyo + s.z * syo;
        var z1 = -s.x * syo + s.z * cyo;
        var y1 = s.y * cxo - z1 * sxo;
        var z2 = s.y * sxo + z1 * cxo;
        var p = 2.2 / (2.2 + z2); // perspective ~0.69 (far) .. ~1.83 (near)
        proj[i] = { x: cx + x1 * R * p, y: cy + y1 * R * p, s: p };
      }
    }

    /** The star that ignites: the partner star projected nearest the anchor. */
    function pickIgnited(px, py) {
      var best = -1, bd = Infinity;
      for (var i = 0; i < Math.min(PARTNER_STARS, stars.length); i++) {
        var dx = proj[i].x - px, dy = proj[i].y - py;
        var d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      ignitedIdx = best;
      igniteT = reduce ? 1 : 0;
    }

    function drawThread(p, ax, ay, e) {
      // quadratic thread from the star to the record anchor, drawn to `e`
      var mx = (p.x + ax) / 2, my = (p.y + ay) / 2;
      var dx = ax - p.x, dy = ay - p.y;
      var cxp = mx - dy * 0.18, cyp = my + dx * 0.18;
      var shimmer = 0.4 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2));
      ctx.strokeStyle = "rgba(" + pal.accent + "," + (shimmer * e).toFixed(3) + ")";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      var steps = 24;
      for (var k = 1; k <= steps; k++) {
        var u = (k / steps) * e;
        var w0 = (1 - u) * (1 - u), w1 = 2 * (1 - u) * u, w2 = u * u;
        ctx.lineTo(w0 * p.x + w1 * cxp + w2 * ax, w0 * p.y + w1 * cyp + w2 * ay);
      }
      ctx.stroke();
      if (e > 0.95) {
        // the thread arrives: a quiet ring on the record anchor
        ctx.strokeStyle = "rgba(" + pal.accent + ",0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function step() {
      if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);
      t += 0.016 * (1 + 3 * surge) * (resolved ? 0.4 : 1);
      if (surge > 0.004) surge *= 0.97; else surge = 0;
      mouseX += (mouseTX - mouseX) * 0.06;
      mouseY += (mouseTY - mouseY) * 0.06;
      if (ignitedIdx >= 0 && igniteT < 1) igniteT = Math.min(1, igniteT + 0.012);

      var rotY = 0.6 + t * 0.05 + mouseX;
      var rotX = -0.12 + scrollTilt + mouseY;
      var R = Math.min(W, H) * 0.52 * (1 - 0.25 * conv);
      var ax = W * opts.center[0], ay = H * opts.center[1];
      project(rotY, rotX, R, ax, ay);

      if (resolved && ignitedIdx < 0) pickIgnited(ax, ay * 0.8);

      // constellation lines
      for (var e = 0; e < edges.length; e++) {
        var pa = proj[edges[e].a], pb = proj[edges[e].b];
        var al = pal.edgeAlpha * Math.min(pa.s, pb.s) * (1 - conv * 0.4);
        ctx.strokeStyle = "rgba(" + pal.star + "," + al.toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // stars
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i], p = proj[i];
        var depth = clamp01((p.s - 0.68) / 1.15);
        var twk = 0.72 + 0.28 * Math.sin(t * st.tw * 1.4 + st.ph);
        var alpha = pal.baseAlpha * twk * (0.35 + 0.65 * depth) * (1 + surge * 0.6);
        if (resolved && i !== ignitedIdx) alpha *= 0.75;
        if (alpha > 0.95) alpha = 0.95;
        var col = st.kind ? pal.accent : pal.star;
        var rad = st.r * p.s;
        if (st.kind === 2) {
          // partner stars carry a soft halo
          ctx.fillStyle = "rgba(" + pal.accent + "," + (alpha * 0.18).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(" + col + "," + alpha.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // the ignited star: growing halo, swollen core, thread to the anchor
      if (ignitedIdx >= 0 && proj[ignitedIdx]) {
        var ip = proj[ignitedIdx];
        var ease = easeOut(igniteT);
        ctx.fillStyle = "rgba(" + pal.accent + "," + (0.28 * ease).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(ip.x, ip.y, 8 + 38 * ease, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(" + pal.accent + ",0.95)";
        ctx.beginPath();
        ctx.arc(ip.x, ip.y, 2.5 + 2 * ease, 0, Math.PI * 2);
        ctx.fill();
        drawThread(ip, ax, ay, ease);
      }
    }

    function loop() { step(); raf = requestAnimationFrame(loop); }
    function start() { if (raf == null && visible && !reduce) loop(); }
    function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }

    // restrained scroll storytelling: tilt + focus, never pinning
    function onScroll() {
      if (!H) return;
      if (opts.scrollMode === "hero") {
        var p = clamp01((window.scrollY || 0) / ((window.innerHeight || 1) * 0.9));
        scrollTilt = p * 0.3;
        conv = p * 0.8;
      } else {
        var rect = canvas.getBoundingClientRect();
        var pr = clamp01(1 - rect.top / (window.innerHeight || 1));
        scrollTilt = -0.08 + pr * 0.2;
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    // mouse parallax, hover-capable devices only
    if (canHover && !reduce) {
      var host = canvas.parentElement || canvas;
      host.addEventListener("pointermove", function (ev) {
        mouseTX = ((ev.clientX / (window.innerWidth || 1)) * 2 - 1) * 0.18;
        mouseTY = ((ev.clientY / (window.innerHeight || 1)) * 2 - 1) * 0.12;
      });
      host.addEventListener("pointerleave", function () {
        mouseTX = 0;
        mouseTY = 0;
      });
    }

    if ("ResizeObserver" in window) {
      new ResizeObserver(function () { resize(); }).observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0.01 }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });

    resize();
    onScroll();
    start();

    return {
      surge: function () {
        if (reduce) return;
        surge = 1;
      },
      ignite: function () {
        if (resolved) return;
        resolved = true;
        if (reduce) step(); // static frame: picks + draws the ignited state
        else surge = 1;
      }
    };
  }

  createAtlas(document.getElementById("mtAtlasHero"), {
    palette: LIGHT,
    density: 1 / 9000,
    maxStars: 170,
    center: [0.62, 0.48],
    scrollMode: "hero"
  });

})();
