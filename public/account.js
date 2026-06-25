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

  async function getCsrfToken() {
    const res = await fetch("/auth/csrf", { credentials: "same-origin" });
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
      "login=success": ["You're signed in.", "success"],
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
          window.location.href = "/home?login=success";
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

  /* ---- Nav auth state (for any page with #navAuth) ---- */
  async function renderNavAuth() {
    const container = document.getElementById("navAuth");
    if (!container) return;
    try {
      const res = await fetch("/auth/me", { credentials: "same-origin" });
      const data = await res.json();
      if (data.authenticated) {
        container.innerHTML =
          '<a href="#" class="nav-link" id="logoutLink">Log Out</a>';
        document
          .getElementById("logoutLink")
          .addEventListener("click", async (e) => {
            e.preventDefault();
            await postJson("/auth/logout", {});
            window.location.href = "/home";
          });
      } else {
        container.innerHTML =
          '<a href="/login" class="nav-link">Log In</a>';
      }
    } catch {
      container.innerHTML = '<a href="/login" class="nav-link">Log In</a>';
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const msg = document.getElementById("formMessage");
    renderQueryMessage(msg);
    wireSignup();
    wireLogin();
    renderNavAuth();
  });
})();
