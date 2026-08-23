/* HavenLink editorial pages - shared behavior: nav height sync, nav scroll
   state, reveal-on-scroll, stat count-up. Loaded (defer) by every page that
   uses the editorial design system. Page-specific behavior (homepage threads
   canvas, partner form logic, …) lives in per-page scripts. Everything is
   null-checked - the SPA fallback can serve pages on unexpected routes. */
(function () {
  "use strict";

  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReduced = reduceMotion.matches;
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function (e) {
      prefersReduced = e.matches;
    });
  }

  /* ---------- Nav height → --hm-nav-h (sticky offsets) ---------- */

  var navbar = document.getElementById("navbar");

  /* getBoundingClientRect, not offsetHeight: the nav is a fractional number of
     pixels tall (padding in rem against a scaled root), and offsetHeight rounds
     it to an integer. Rounded up, the adopt step bar sticks a hair below the
     nav and page content shows through the seam; rounded down it tucks under.
     The exact height makes the two bars meet. */
  function syncNavHeight() {
    if (!navbar) return;
    docEl.style.setProperty(
      "--hm-nav-h",
      navbar.getBoundingClientRect().height + "px"
    );
  }
  syncNavHeight();
  window.addEventListener("resize", syncNavHeight);

  /* ---------- Reveal on scroll ---------- */

  var revealTargets = document.querySelectorAll(".hm-reveal, .hm-chapter");
  if ("IntersectionObserver" in window && revealTargets.length) {
    if (prefersReduced) {
      revealTargets.forEach(function (el) { el.classList.add("is-in"); });
    } else {
      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-in");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
      );
      revealTargets.forEach(function (el) { revealObserver.observe(el); });
    }
  } else {
    revealTargets.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- Stat count-up ---------- */

  var countEl = document.querySelector("[data-countup]");
  if (countEl && "IntersectionObserver" in window) {
    var countTarget = parseInt(countEl.getAttribute("data-countup"), 10) || 0;
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countObserver.unobserve(entry.target);
        if (prefersReduced) {
          countEl.textContent = String(countTarget);
          return;
        }
        var start = null;
        var DURATION = 900;
        function tick(ts) {
          if (start === null) start = ts;
          var t = Math.min((ts - start) / DURATION, 1);
          var eased = 1 - Math.pow(1 - t, 3);
          countEl.textContent = String(Math.round(eased * countTarget));
          if (t < 1) requestAnimationFrame(tick);
        }
        countEl.textContent = "0";
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    countObserver.observe(countEl);
  }

  /* ---------- Nav scroll state ---------- */

  function updateNav() {
    if (!navbar) return;
    navbar.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  var scrollQueued = false;
  window.addEventListener(
    "scroll",
    function () {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(function () {
        scrollQueued = false;
        updateNav();
      });
    },
    { passive: true }
  );
  updateNav();
})();
