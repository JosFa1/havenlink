/**
 * HavenLink - Team page ("The People") behavior.
 *
 * 1. Hero constellation: a cartographic night-map on ink - drifting nodes at
 *    three depths joined by hairlines, terracotta hubs sending arced "routes"
 *    (with travelling signal pulses) into a knot that leans toward the cursor.
 * 2. Hero scroll parallax: content and canvas fall away at different speeds.
 * 3. Stat count-up for the hero foot ([data-tmcount] - separate from
 *    editorial.js's single [data-countup] hook).
 * 4. Founder portrait drift: the oversized image glides inside its frame.
 *
 * Self-contained (no CDN - CSP), DPR-aware, pauses off-screen/hidden tab,
 * static frame + no parallax under prefers-reduced-motion.
 */
(function () {
  "use strict";

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==================== 1. Hero constellation ==================== */

  (function () {
    var canvas = document.getElementById("tmNetwork");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var PAPER = "250,248,245";
    var TERRA = "224,151,105";

    var nodes = [];
    var pulses = [];
    var W = 0, H = 0, dpr = 1, frame = 0;
    var base = { x: 0, y: 0 };
    var anchor = { x: 0, y: 0 };
    var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }; // viewport-normalized
    var raf = null;
    var visible = true;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function build() {
      var count = W < 640 ? 26 : W < 1100 ? 42 : 58;
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: rand(0, W),
          y: rand(0, H),
          vx: rand(-0.12, 0.12),
          vy: rand(-0.1, 0.1),
          z: rand(0.35, 1),          // depth: size, alpha, parallax reach
          hub: Math.random() < 0.15,
          bow: Math.random() < 0.5 ? 1 : -1, // arc bend direction
          cx: 0,
          cy: 0
        });
      }
      pulses = [];
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
      base.x = W * 0.68;
      base.y = H * 0.42;
      anchor.x = base.x;
      anchor.y = base.y;
      build();
      if (reduce) step();
    }

    function qpoint(x1, y1, cx, cy, x2, y2, t) {
      var u = 1 - t;
      return {
        x: u * u * x1 + 2 * u * t * cx + t * t * x2,
        y: u * u * y1 + 2 * u * t * cy + t * t * y2
      };
    }

    function step() {
      ctx.clearRect(0, 0, W, H);
      frame++;

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;
      var offX = pointer.x - 0.5;
      var offY = pointer.y - 0.5;

      anchor.x = base.x + offX * 36;
      anchor.y = base.y + offY * 26;

      var i, n, a, b, dx, dy, d, alpha;

      /* faint meridian rings around the knot */
      var ringR = Math.min(W, H);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(" + PAPER + ",0.045)";
      for (i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, ringR * (0.12 + i * 0.12), 0, Math.PI * 2);
        ctx.stroke();
      }

      /* integrate */
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if (n.hub) {
          n.vx += (anchor.x - n.x) * 0.00002;
          n.vy += (anchor.y - n.y) * 0.00002;
        }
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.996;
        n.vy *= 0.996;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
        n.x = Math.max(0, Math.min(W, n.x));
        n.y = Math.max(0, Math.min(H, n.y));
      }

      /* display coords with per-depth pointer parallax */
      var px = [], py = [];
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        px[i] = n.x + offX * 26 * n.z;
        py[i] = n.y + offY * 18 * n.z;
      }

      /* hairline links */
      var maxD = Math.min(W, H) * 0.24;
      ctx.lineWidth = 1;
      for (a = 0; a < nodes.length; a++) {
        for (b = a + 1; b < nodes.length; b++) {
          dx = px[a] - px[b];
          dy = py[a] - py[b];
          d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxD) {
            alpha = (1 - d / maxD) * 0.16 * Math.min(nodes[a].z, nodes[b].z);
            ctx.strokeStyle = "rgba(" + PAPER + "," + alpha.toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(px[a], py[a]);
            ctx.lineTo(px[b], py[b]);
            ctx.stroke();
          }
        }
      }

      /* arced routes: hubs -> knot */
      var reach = Math.max(W, H) * 0.7;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if (!n.hub) continue;
        dx = anchor.x - px[i];
        dy = anchor.y - py[i];
        d = Math.sqrt(dx * dx + dy * dy) || 1;
        n.cx = (px[i] + anchor.x) / 2 - (dy / d) * d * 0.18 * n.bow;
        n.cy = (py[i] + anchor.y) / 2 + (dx / d) * d * 0.18 * n.bow;
        alpha = Math.max(0, 1 - d / reach) * 0.3;
        ctx.strokeStyle = "rgba(" + TERRA + "," + alpha.toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        ctx.quadraticCurveTo(n.cx, n.cy, anchor.x, anchor.y);
        ctx.stroke();
      }

      /* signal pulses travelling the routes */
      if (!reduce && frame % 130 === 0) {
        var hubs = [];
        for (i = 0; i < nodes.length; i++) if (nodes[i].hub) hubs.push(i);
        if (hubs.length) {
          pulses.push({ i: hubs[(Math.random() * hubs.length) | 0], t: 0 });
        }
      }
      for (i = pulses.length - 1; i >= 0; i--) {
        var p = pulses[i];
        p.t += 0.012;
        n = nodes[p.i];
        if (p.t >= 1 || !n || !n.hub) {
          pulses.splice(i, 1);
          continue;
        }
        var e = p.t < 0.5
          ? 2 * p.t * p.t
          : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
        var pt = qpoint(px[p.i], py[p.i], n.cx, n.cy, anchor.x, anchor.y, e);
        ctx.fillStyle = "rgba(" + PAPER + ",0.9)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(" + TERRA + ",0.35)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      /* nodes */
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if (n.hub) {
          ctx.fillStyle = "rgba(" + TERRA + ",0.9)";
          ctx.beginPath();
          ctx.arc(px[i], py[i], 1 + n.z * 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle =
            "rgba(" + PAPER + "," + (0.14 + 0.32 * n.z).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(px[i], py[i], 0.8 + n.z * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* the knot */
      ctx.fillStyle = "rgba(" + TERRA + ",0.95)";
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(" + TERRA + ",0.4)";
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      var breathe = 16 + Math.sin(frame * 0.02) * 4;
      ctx.strokeStyle = "rgba(" + TERRA + ",0.16)";
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, breathe, 0, Math.PI * 2);
      ctx.stroke();
    }

    function loop() {
      step();
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (raf == null && visible && !reduce) loop();
    }
    function stop() {
      if (raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    if (!reduce) {
      window.addEventListener("pointermove", function (e) {
        pointer.tx = e.clientX / (window.innerWidth || 1);
        pointer.ty = e.clientY / (window.innerHeight || 1);
      }, { passive: true });
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
      if (document.hidden) stop();
      else start();
    });

    resize();
    start();
  })();

  /* ==================== 2. Hero scroll parallax ==================== */

  (function () {
    if (reduce) return;
    var hero = document.querySelector(".tm-hero");
    var inner = document.querySelector(".tm-hero-inner");
    var cv = document.getElementById("tmNetwork");
    if (!hero || !inner) return;

    var ticking = false;
    function apply() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      var h = hero.offsetHeight || 1;
      if (y > h) y = h;
      var p = y / h;
      inner.style.transform = "translate3d(0," + (y * 0.18).toFixed(1) + "px,0)";
      inner.style.opacity = String(Math.max(1 - p * 1.15, 0));
      if (cv) {
        cv.style.transform = "translate3d(0," + (y * 0.32).toFixed(1) + "px,0)";
      }
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    }, { passive: true });
    apply();
  })();

  /* ==================== 3. Stat count-up ==================== */

  (function () {
    var els = document.querySelectorAll("[data-tmcount]");
    if (!els.length) return;

    function pad(v) { return (v < 10 ? "0" : "") + v; }

    function animate(el) {
      var target = parseInt(el.getAttribute("data-tmcount"), 10) || 0;
      if (reduce) {
        el.textContent = pad(target);
        return;
      }
      var start = null;
      var DURATION = 1100;
      function tick(ts) {
        if (start === null) start = ts;
        var t = Math.min((ts - start) / DURATION, 1);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = pad(Math.round(eased * target));
        if (t < 1) requestAnimationFrame(tick);
      }
      el.textContent = "00";
      requestAnimationFrame(tick);
    }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            io.unobserve(entry.target);
            animate(entry.target);
          }
        });
      }, { threshold: 0.4 });
      els.forEach(function (el) { io.observe(el); });
    } else {
      els.forEach(function (el) {
        el.textContent = pad(parseInt(el.getAttribute("data-tmcount"), 10) || 0);
      });
    }
  })();

  /* ==================== 4. Founder portrait drift ==================== */

  (function () {
    if (reduce) return;
    var figs = document.querySelectorAll(".tm-person-portrait");
    if (!figs.length) return;

    var items = [];
    figs.forEach(function (f) {
      var img = f.querySelector("img");
      if (img) items.push({ f: f, img: img });
    });
    if (!items.length) return;

    var ticking = false;
    function apply() {
      ticking = false;
      var vh = window.innerHeight || 1;
      for (var i = 0; i < items.length; i++) {
        var r = items[i].f.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        var p = (r.top + r.height / 2 - vh / 2) / (vh / 2); // -1 .. 1
        items[i].img.style.transform =
          "translate3d(0," + (p * -14).toFixed(1) + "px,0)";
      }
    }
    function queue() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    }
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    apply();
  })();
})();
