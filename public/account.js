/**
 * HavenLink account UI: login/signup form handling + nav auth state.
 *
 * Security notes:
 *  - All state-changing requests fetch a fresh CSRF token from /auth/csrf and send
 *    it in the `x-csrf-token` header (double-submit; the cookie half is httpOnly).
 *  - Requests use `credentials: "same-origin"` so the session cookie is sent.
 *  - The "Continue with Google" control is a plain link (full-page GET) - the OAuth
 *    round-trip is CSRF-protected by the server via the `state` parameter.
 */
(function () {
  "use strict";

  async function getCsrfToken() {
    const res = await fetch("/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Could not get CSRF token");
    const data = await res.json();
    return data.csrfToken;
  }

  async function postJson(url, body) {
    const csrfToken = await getCsrfToken();
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(body),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* no body */
    }
    return { ok: res.ok, status: res.status, data };
  }

  /* ---- Post-login redirect target (?next=) --------------------------------- */
  // Pages that live behind the login gate. Kept in sync with the server-side
  // allowlist in src/middleware/pageGuard.ts. Anything not on this list falls
  // back to /home, so a forged ?next can never redirect off-site.
  const PROTECTED_PAGES = [
    "/adopt/home-study",
    "/adopt/intake-form",
    "/adopt/matching",
    "/adopt/resources",
    "/adopt/calculator",
  ];

  // Canonicalise the same way the server does (lower-case, drop trailing slash
  // and a trailing .html) so the value round-trips cleanly, then allowlist it.
  function sanitizeNext(raw) {
    if (!raw) return null;
    let p;
    try {
      p = decodeURIComponent(raw);
    } catch {
      return null;
    }
    p = p.toLowerCase();
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    if (p.endsWith(".html")) p = p.slice(0, -5);
    return PROTECTED_PAGES.indexOf(p) !== -1 ? p : null;
  }

  /** The safe redirect target for the current page, or /home. */
  function postLoginDest() {
    const next = new URLSearchParams(window.location.search).get("next");
    return sanitizeNext(next) || "/home";
  }

  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-message form-message-" + (type || "info");
    el.style.display = "block";
  }

  /* ---- Messages passed back via query string (verification, OAuth errors) ---- */
  function renderQueryMessage(msgEl) {
    const params = new URLSearchParams(window.location.search);
    const map = {
      "verify=success": ["Email verified! You can now sign in.", "success"],
      "verify=invalid": [
        "That verification link is invalid or has expired. Request a new one below.",
        "error",
      ],
      "error=google_unverified": [
        "Your Google email is not verified, so we can't sign you in with Google.",
        "error",
      ],
      "error=google_failed": [
        "Google sign-in failed. Please try again.",
        "error",
      ],
    };
    for (const key in map) {
      const [k, v] = key.split("=");
      if (params.get(k) === v) {
        showMessage(msgEl, map[key][0], map[key][1]);
        return;
      }
    }
  }

  /* ---- Signup form ---- */
  function wireSignup() {
    const form = document.getElementById("signupForm");
    if (!form) return;
    const msg = document.getElementById("formMessage");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;
      const confirm = form.confirm.value;

      if (password !== confirm) {
        return showMessage(msg, "Passwords do not match.", "error");
      }
      if (password.length < 12) {
        return showMessage(
          msg,
          "Password must be at least 12 characters.",
          "error"
        );
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const { ok, data } = await postJson("/auth/signup", { email, password });
        if (ok) {
          form.reset();
          showMessage(
            msg,
            data.message || "Account created. Check your email to verify.",
            "success"
          );
        } else {
          showMessage(msg, data.error || "Sign up failed.", "error");
        }
      } catch {
        showMessage(msg, "Something went wrong. Please try again.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---- Login form ---- */
  function wireLogin() {
    const form = document.getElementById("loginForm");
    if (!form) return;
    const msg = document.getElementById("formMessage");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const { ok, data } = await postJson("/auth/login", { email, password });
        if (ok) {
          window.location.href = postLoginDest();
        } else {
          showMessage(msg, data.error || "Sign in failed.", "error");
        }
      } catch {
        showMessage(msg, "Something went wrong. Please try again.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---- Carry ?next through the Google OAuth link ---- */
  // The "Continue with Google" control is a static link; append the validated
  // next so the server can stash it before redirecting to Google.
  function wireGoogleNext() {
    const link = document.querySelector('a[href^="/auth/google"]');
    if (!link) return;
    const dest = sanitizeNext(
      new URLSearchParams(window.location.search).get("next")
    );
    if (dest) link.href = "/auth/google?next=" + encodeURIComponent(dest);
  }

  /* ---- Logout click handler ---- */
  // Must never fail silently: on any error we restore the control and tell the
  // user, instead of leaving the page looking like "nothing happened".
  async function handleLogout(e) {
    e.preventDefault();
    const link = e.currentTarget;
    if (link.dataset.busy === "1") return; // ignore rapid double-clicks
    link.dataset.busy = "1";
    const original = link.textContent;
    link.textContent = "Logging out…";
    try {
      const { ok, status } = await postJson("/auth/logout", {});
      if (!ok) throw new Error("Logout failed (HTTP " + status + ")");
      // Full navigation so the destination re-reads auth state from a fresh
      // /auth/me; assign() reloads even when we're already on /home.
      window.location.assign("/home");
    } catch (err) {
      console.error("[HavenLink] Logout failed:", err);
      link.textContent = original;
      link.dataset.busy = "";
      showMessage(
        document.getElementById("formMessage"),
        "Could not log out. Please check your connection and try again.",
        "error"
      );
      alert("Could not log out. Please try again.");
    }
  }

  /* ---- Current auth state (fetched once per page load, shared below) ---- */
  async function fetchAuthState() {
    try {
      // no-store: never let a cached response misreport whether we're signed in.
      const res = await fetch("/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  /* ---- Nav auth state (for any page with #navAuth) ---- */
  function renderNavAuth(state) {
    const container = document.getElementById("navAuth");
    if (!container) return;
    if (state && state.authenticated) {
      container.innerHTML =
        '<a href="#" class="nav-link" id="logoutLink">Log Out</a>';
      document
        .getElementById("logoutLink")
        .addEventListener("click", handleLogout);
    } else {
      container.innerHTML = '<a href="/login" class="nav-link">Log In</a>';
    }
  }

  /* ---- One-time newsletter popup (shown after a first signup) ---- */
  // Suppresses re-nagging within the same tab session even if the server write
  // failed; the server-side pending flag is the durable "already asked" record.
  const NEWSLETTER_DISMISS_KEY = "hl_newsletter_dismissed";

  function maybeShowNewsletterPopup(state) {
    if (!state || !state.authenticated || !state.user) return;
    if (!state.user.newsletterPromptPending) return;
    // Never over the auth pages themselves (they redirect away on success anyway).
    const path = window.location.pathname;
    if (path === "/login" || path === "/signup") return;
    try {
      if (sessionStorage.getItem(NEWSLETTER_DISMISS_KEY)) return;
    } catch {
      /* sessionStorage unavailable - fall through and show once */
    }
    showNewsletterPopup();
  }

  function showNewsletterPopup() {
    if (document.getElementById("newsletterModal")) return;
    buildNewsletterPopup();
  }

  /* ---- Footer "Newsletter" sign-up trigger ---- */
  // Signed in: open the popup on the spot. Signed out: remember the request in
  // sessionStorage (survives the full-page login round-trip, including the
  // Google OAuth redirect) and send them to /login; consumeNewsletterRequest()
  // then opens the popup on whichever page they land on after signing in.
  const NEWSLETTER_REQUEST_KEY = "hl_newsletter_requested";

  function wireFooterNewsletter(state) {
    const buttons = document.querySelectorAll(".footer-newsletter-btn");
    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        if (state && state.authenticated) {
          showNewsletterPopup();
          return;
        }
        try {
          sessionStorage.setItem(NEWSLETTER_REQUEST_KEY, "1");
        } catch {
          /* worst case: they sign in and no popup follows */
        }
        // Come back to this page after login when it's on the allowlist.
        const dest = sanitizeNext(window.location.pathname);
        window.location.href = dest
          ? "/login?next=" + encodeURIComponent(dest)
          : "/login";
      });
    }
  }

  // Returns true when a pending footer request was fulfilled. An explicit
  // request bypasses both the pending-prompt flag and the session dismiss key,
  // so it works for first-time and returning users alike.
  function consumeNewsletterRequest(state) {
    const path = window.location.pathname;
    // Keep the flag alive across the auth pages; it's consumed after redirect.
    if (path === "/login" || path === "/signup") return false;
    let requested = false;
    try {
      requested = sessionStorage.getItem(NEWSLETTER_REQUEST_KEY) === "1";
    } catch {
      return false;
    }
    if (!requested) return false;
    if (!state || !state.authenticated) return false;
    try {
      sessionStorage.removeItem(NEWSLETTER_REQUEST_KEY);
    } catch {
      /* ignore */
    }
    showNewsletterPopup();
    return true;
  }

  function buildNewsletterPopup() {
    const overlay = document.createElement("div");
    overlay.id = "newsletterModal";
    overlay.className = "newsletter-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "newsletterTitle");

    const card = document.createElement("div");
    card.className = "newsletter-card";

    // --- Left: cinematic ink hero panel carrying the woven-thread canvas ---
    const hero = document.createElement("div");
    hero.className = "newsletter-hero";

    const canvas = document.createElement("canvas");
    canvas.className = "newsletter-canvas";
    canvas.setAttribute("aria-hidden", "true");

    const index = document.createElement("span");
    index.className = "newsletter-index";
    index.textContent = "No. 01";

    hero.appendChild(canvas);
    hero.appendChild(index);

    // --- Right: paper content pane ---
    const content = document.createElement("div");
    content.className = "newsletter-content";

    const body = document.createElement("div");
    body.className = "newsletter-body";

    const eyebrow = document.createElement("span");
    eyebrow.className = "newsletter-eyebrow";
    eyebrow.textContent = "The Dispatch — Newsletter";

    const title = document.createElement("h2");
    title.id = "newsletterTitle";
    title.className = "newsletter-title";
    title.appendChild(document.createTextNode("Stay on the thread "));
    const titleEm = document.createElement("em");
    titleEm.textContent = "home.";
    title.appendChild(titleEm);

    const text = document.createElement("p");
    text.className = "newsletter-text";
    text.textContent =
      "Our newsletter brings notes for each stage of the journey — what to prepare, and who can help. No spam.";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "newsletter-accept";
    accept.textContent = "Yes, sign me up";

    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "newsletter-decline";
    decline.textContent = "No thanks";

    const actions = document.createElement("div");
    actions.className = "newsletter-actions";
    actions.appendChild(accept);
    actions.appendChild(decline);

    body.appendChild(eyebrow);
    body.appendChild(title);
    body.appendChild(text);
    body.appendChild(actions);

    // --- Confirmation state: crossfades in over the body on accept ---
    const confirm = document.createElement("div");
    confirm.className = "newsletter-confirm";
    confirm.setAttribute("aria-live", "polite");

    const confirmEyebrow = document.createElement("span");
    confirmEyebrow.className = "newsletter-eyebrow";
    confirmEyebrow.textContent = "The Dispatch — Newsletter";

    const confirmTitle = document.createElement("p");
    confirmTitle.className = "newsletter-confirm-title";
    confirmTitle.textContent = "You're on the list.";

    const confirmText = document.createElement("p");
    confirmText.className = "newsletter-confirm-text";
    confirmText.textContent = "The first dispatch is on its way.";

    confirm.appendChild(confirmEyebrow);
    confirm.appendChild(confirmTitle);
    confirm.appendChild(confirmText);

    content.appendChild(body);
    content.appendChild(confirm);

    card.appendChild(hero);
    card.appendChild(content);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add("newsletter-open");

    // Signature visual: start once the panel is laid out with real dimensions.
    overlay._threads = startNewsletterThreads(canvas, hero);

    function onKeydown(e) {
      if (e.key === "Escape") closeNewsletter(overlay, false);
    }
    accept.addEventListener("click", () => acceptNewsletter(overlay));
    decline.addEventListener("click", () => closeNewsletter(overlay, false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeNewsletter(overlay, false); // backdrop = decline
    });
    document.addEventListener("keydown", onKeydown);
    overlay._onKeydown = onKeydown; // so teardown can detach it

    accept.focus();
  }

  // Removes the popup and all of its listeners/animation. Idempotent.
  function teardownNewsletter(overlay) {
    if (overlay._closeTimer) {
      clearTimeout(overlay._closeTimer);
      overlay._closeTimer = null;
    }
    if (overlay._onKeydown) {
      document.removeEventListener("keydown", overlay._onKeydown);
      overlay._onKeydown = null;
    }
    if (overlay._threads) {
      overlay._threads.stop();
      overlay._threads = null;
    }
    overlay.remove();
    document.body.classList.remove("newsletter-open");
  }

  // Records the choice locally + on the server. Best-effort: if the POST fails,
  // the server-side pending flag stays set and we ask again in a future session.
  function recordNewsletterChoice(subscribe) {
    try {
      sessionStorage.setItem(NEWSLETTER_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    postJson("/auth/newsletter", { subscribe: !!subscribe }).catch(() => {
      /* best-effort */
    });
  }

  // Decline / Escape / backdrop: record the choice and remove immediately.
  function closeNewsletter(overlay, subscribe) {
    recordNewsletterChoice(!!subscribe);
    teardownNewsletter(overlay);
  }

  // Accept: record immediately, then play the in-modal confirmation moment
  // (threads tie into the knot + confirm crossfade) before removing.
  function acceptNewsletter(overlay) {
    if (overlay._accepted) return; // guard against a double click
    overlay._accepted = true;
    recordNewsletterChoice(true);

    const card = overlay.querySelector(".newsletter-card");
    if (card) card.classList.add("is-accepted");
    if (overlay._threads) overlay._threads.accept();

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // Escape still exits during the beat via the existing keydown handler.
    overlay._closeTimer = setTimeout(
      () => teardownNewsletter(overlay),
      prefersReduced ? 600 : 1150
    );
  }

  // Compact adaptation of the homepage threads hero (public/home.js): light-on-ink
  // woven threads that converge on a terracotta knot. Returns a controller with
  // stop() (teardown) and accept() (tighten the weave into the knot).
  function startNewsletterThreads(canvas, host) {
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return { stop() {}, accept() {} };

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const LIGHT = "245, 241, 235";
    const TERRA = "201, 122, 74";
    const KNOT = "228, 183, 154";
    const SAMPLES = 40;

    let threads = [];
    let W = 0;
    let H = 0;
    let rafId = null;
    let lastTs = 0;
    let elapsed = 0;
    let converge = 0; // eased 0..1 "tie the knot" progress after accept
    let convergeTarget = 0;

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function smoothstep(a, b, x) {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }

    function build() {
      threads = [];
      const count = W <= 360 ? 8 : 12;
      for (let i = 0; i < count; i++) {
        const isTerra = i % 4 === 1;
        threads.push({
          lane: 0.12 + (i / (count - 1)) * 0.76 + rand(-0.02, 0.02),
          phase: rand(0, Math.PI * 2),
          amp1: rand(8, 20),
          amp2: rand(4, 12),
          f1: rand(0.004, 0.008),
          f2: rand(0.01, 0.016),
          s1: rand(0.1, 0.22) * (i % 2 ? 1 : -1),
          s2: rand(0.14, 0.3),
          color: isTerra ? TERRA : LIGHT,
          alpha: isTerra ? rand(0.5, 0.85) : rand(0.16, 0.4),
          width: isTerra ? 1.5 : rand(0.6, 1.1),
        });
      }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = host.clientWidth;
      H = host.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (reduceMq.matches) draw(13.7); // static frame; no loop under reduced motion
    }

    function draw(t) {
      if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);
      const anchorX = W * 0.72;
      const anchorY = H * 0.5;
      const step = W / (SAMPLES - 1);

      for (let i = 0; i < threads.length; i++) {
        const th = threads[i];
        const laneY = th.lane * H;
        const pts = [];
        for (let s = 0; s < SAMPLES; s++) {
          const x = s * step;
          const noise =
            th.amp1 * Math.sin(x * th.f1 + t * th.s1 + th.phase) +
            th.amp2 * Math.sin(x * th.f2 + t * th.s2 + th.phase * 1.7);
          const braid = 9 * Math.sin(x * 0.02 + t * 0.22 + th.phase);
          // weave toward the anchor as x grows across the panel
          const w = smoothstep(0.3, 0.92, x / W) * 0.9;
          let y = (laneY + noise + braid) * (1 - w) + anchorY * w;
          // on accept, pull the whole line into the knot
          y += (anchorY - y) * converge * 0.9;
          pts.push(y);
        }
        ctx.beginPath();
        ctx.strokeStyle =
          "rgba(" + th.color + ", " + (th.alpha + converge * 0.15) + ")";
        ctx.lineWidth = th.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(0, pts[0]);
        for (let k = 1; k < SAMPLES - 1; k++) {
          const xc = (k * step + (k + 1) * step) / 2;
          const yc = (pts[k] + pts[k + 1]) / 2;
          ctx.quadraticCurveTo(k * step, pts[k], xc, yc);
        }
        ctx.lineTo(W, pts[SAMPLES - 1]);
        ctx.stroke();
      }

      // convergence knot: a woven ring that tightens + fills as it ties on accept
      const pulse = reduceMq.matches ? 0 : 1;
      const knotR =
        (5.5 + 1.4 * Math.sin(t * 0.6) * pulse) * (1 - converge * 0.35);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(" + KNOT + ", " + (0.55 + 0.3 * converge) + ")";
      ctx.lineWidth = 1.4;
      ctx.arc(anchorX, anchorY, Math.max(1.5, knotR), 0, Math.PI * 2);
      ctx.stroke();
      if (converge > 0.01) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + KNOT + ", " + 0.5 * converge + ")";
        ctx.arc(anchorX, anchorY, Math.max(1, knotR * 0.55), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(ts - lastTs, 50) / 1000;
      lastTs = ts;
      elapsed += dt;
      converge += (convergeTarget - converge) * 0.08;
      draw(elapsed);
      rafId = requestAnimationFrame(loop);
    }

    function start() {
      if (rafId !== null || reduceMq.matches || document.hidden) return;
      lastTs = 0;
      rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function onVisibility() {
      if (document.hidden) stopLoop();
      else start();
    }

    let ro = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(() => resize());
      ro.observe(host);
    } else {
      window.addEventListener("resize", resize);
    }
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    start();

    return {
      stop() {
        stopLoop();
        if (ro) ro.disconnect();
        else window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", onVisibility);
      },
      accept() {
        convergeTarget = 1;
        if (reduceMq.matches) {
          converge = 1;
          draw(elapsed || 13.7);
        }
      },
    };
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const msg = document.getElementById("formMessage");
    renderQueryMessage(msg);
    wireSignup();
    wireLogin();
    wireGoogleNext();
    const state = await fetchAuthState();
    renderNavAuth(state);
    wireFooterNewsletter(state);
    if (!consumeNewsletterRequest(state)) maybeShowNewsletterPopup(state);
  });
})();
