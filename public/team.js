/**
 * HavenLink — Team page hero visual.
 *
 * A generative "network of places": drifting nodes joined by hairline threads,
 * with a handful of hubs that gather toward a terracotta knot on the right —
 * echoing the global-reach map further down the page. Self-contained 2D canvas
 * (no CDN), DPR-aware, pauses off-screen / when the tab is hidden, and renders a
 * single static frame when the visitor prefers reduced motion.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("tmNetwork");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var INK = "20,33,61";
  var TERRA = "180,85,31";

  var nodes = [];
  var W = 0, H = 0, dpr = 1;
  var base = { x: 0, y: 0 };
  var anchor = { x: 0, y: 0 };
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var raf = null;
  var visible = true;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function build() {
    var count = W < 640 ? 24 : W < 1100 ? 40 : 56;
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-0.12, 0.12),
        vy: rand(-0.1, 0.1),
        r: rand(0.8, 2.3),
        hub: Math.random() < 0.16
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
    base.x = W * 0.72;
    base.y = H * 0.46;
    anchor.x = base.x;
    anchor.y = base.y;
    pointer.x = pointer.tx = base.x;
    pointer.y = pointer.ty = base.y;
    build();
    if (reduce) { step(); }
  }

  function step() {
    ctx.clearRect(0, 0, W, H);

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    anchor.x = base.x + (pointer.x - base.x) * 0.06;
    anchor.y = base.y + (pointer.y - base.y) * 0.06;

    var i, n;
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

    var maxD = Math.min(W, H) * 0.24;
    var a, b, dx, dy, d, alpha;
    for (a = 0; a < nodes.length; a++) {
      for (b = a + 1; b < nodes.length; b++) {
        dx = nodes[a].x - nodes[b].x;
        dy = nodes[a].y - nodes[b].y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d < maxD) {
          alpha = (1 - d / maxD) * 0.2;
          ctx.strokeStyle = "rgba(" + INK + "," + alpha.toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(nodes[a].x, nodes[a].y);
          ctx.lineTo(nodes[b].x, nodes[b].y);
          ctx.stroke();
        }
      }
    }

    var reach = Math.max(W, H) * 0.62;
    for (i = 0; i < nodes.length; i++) {
      if (!nodes[i].hub) continue;
      dx = anchor.x - nodes[i].x;
      dy = anchor.y - nodes[i].y;
      d = Math.sqrt(dx * dx + dy * dy);
      alpha = Math.max(0, 1 - d / reach) * 0.3;
      ctx.strokeStyle = "rgba(" + TERRA + "," + alpha.toFixed(3) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.stroke();
    }

    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      ctx.fillStyle = n.hub
        ? "rgba(" + TERRA + ",0.9)"
        : "rgba(" + INK + ",0.5)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(" + TERRA + ",0.95)";
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(" + TERRA + ",0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 10, 0, Math.PI * 2);
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

  window.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    pointer.tx = e.clientX - rect.left;
    pointer.ty = e.clientY - rect.top;
  }, { passive: true });

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
