/**
 * HavenLink account UI: login/signup form handling + nav auth state.
 *
 * Security notes:
 *  - All state-changing requests fetch a fresh CSRF token from /auth/csrf and send
 *    it in the `x-csrf-token` header (double-submit; the cookie half is httpOnly).
 *  - Requests use `credentials: "same-origin"` so the session cookie is sent.
 *  - The "Continue with Google" control is a plain link (full-page GET) — the OAuth
 *    round-trip is CSRF-protected by the server via the `state` parameter.
 */
(function () {
  "use strict";

  const ACCOUNT_BACKEND_DISABLED = true;
  const ACCOUNT_BACKEND_DISABLED_MESSAGE =
    "HavenLink account features are temporarily paused while we reduce hosting costs. For help, email havenlink.org@gmail.com.";

  function renderBackendDisabled(msgEl) {
    showMessage(msgEl, ACCOUNT_BACKEND_DISABLED_MESSAGE, "info");
    document
      .querySelectorAll("#loginForm input, #loginForm button, #signupForm input, #signupForm button")
      .forEach((el) => {
        el.disabled = true;
      });
    document.querySelectorAll('a[href^="/auth/google"]').forEach((link) => {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.style.pointerEvents = "none";
      link.style.opacity = "0.65";
    });
    const nav = document.getElementById("navAuth");
    if (nav) {
      nav.innerHTML =
        '<a href="mailto:havenlink.org@gmail.com" class="nav-link">Contact</a>';
    }
  }

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
  // back to /home, so a crafted ?next can never redirect off-site.
  const PROTECTED_PAGES = [
    "/adopt/home-study",
    "/adopt/intake-form",
    "/adopt/agency-profiles",
    "/adopt/matching",
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
      /* sessionStorage unavailable — fall through and show once */
    }
    if (document.getElementById("newsletterModal")) return;
    buildNewsletterPopup();
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

    const title = document.createElement("h2");
    title.id = "newsletterTitle";
    title.className = "newsletter-title";
    title.textContent = "Join the HavenLink Newsletter";

    const text = document.createElement("p");
    text.className = "newsletter-text";
    text.textContent =
      "Learn how the adoption process really works — what to expect at each step, how to prepare, and the resources that help families move forward. Helpful updates, no spam.";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn btn-primary newsletter-accept";
    accept.textContent = "Yes, sign me up";

    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "newsletter-decline";
    decline.textContent = "No thanks";

    const actions = document.createElement("div");
    actions.className = "newsletter-actions";
    actions.appendChild(accept);
    actions.appendChild(decline);

    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add("newsletter-open");

    function onKeydown(e) {
      if (e.key === "Escape") closeNewsletter(overlay, false);
    }
    accept.addEventListener("click", () => closeNewsletter(overlay, true));
    decline.addEventListener("click", () => closeNewsletter(overlay, false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeNewsletter(overlay, false); // backdrop = decline
    });
    document.addEventListener("keydown", onKeydown);
    overlay._onKeydown = onKeydown; // so closeNewsletter can detach it

    accept.focus();
  }

  async function closeNewsletter(overlay, subscribe) {
    if (overlay._onKeydown) {
      document.removeEventListener("keydown", overlay._onKeydown);
    }
    overlay.remove();
    document.body.classList.remove("newsletter-open");
    try {
      sessionStorage.setItem(NEWSLETTER_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    try {
      // Records the choice and clears the server-side pending flag. If it fails,
      // the flag stays set and we'll ask again in a future session.
      await postJson("/auth/newsletter", { subscribe: !!subscribe });
    } catch {
      /* best-effort */
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const msg = document.getElementById("formMessage");
    if (ACCOUNT_BACKEND_DISABLED) {
      renderBackendDisabled(msg);
      return;
    }
    renderQueryMessage(msg);
    wireSignup();
    wireLogin();
    wireGoogleNext();
    const state = await fetchAuthState();
    renderNavAuth(state);
    maybeShowNewsletterPopup(state);
  });
})();
