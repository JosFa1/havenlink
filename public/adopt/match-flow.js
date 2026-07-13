/**
 * HavenLink live match flow: drives the "Your match" section on /adopt/matching.
 *
 * Talks to:
 *   GET  /api/match          - eligibility status + stored confirmed match
 *   POST /api/match/roll     - offer a (new) candidate agency
 *   POST /api/match/confirm  - finalize the offered candidate
 *
 * Same security pattern as account.js/intake.js: state-changing requests fetch
 * a fresh CSRF token from /auth/csrf and echo it in the `x-csrf-token` header;
 * everything is sent with same-origin credentials. All API-sourced text is
 * rendered with textContent (never innerHTML).
 */
(function () {
  "use strict";

  var app = document.getElementById("mtApp");
  if (!app) return;

  var prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
    CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    DC: "the District of Columbia", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
    MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
    NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
    NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
    OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
    SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
    UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };

  function stateName(code) {
    return (code && STATE_NAMES[code]) || "your state";
  }

  /* ---------- fetch helpers (account.js pattern) ---------- */

  async function getCsrfToken() {
    var res = await fetch("/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Could not get CSRF token");
    var data = await res.json();
    return data.csrfToken;
  }

  async function postJson(url, body) {
    var csrfToken = await getCsrfToken();
    var res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(body || {}),
    });
    var data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* no body */
    }
    return { ok: res.ok, status: res.status, data: data };
  }

  /* ---------- tiny DOM helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function render(view, nodes) {
    app.setAttribute("data-view", view);
    app.textContent = "";
    nodes.forEach(function (n) {
      if (n) app.appendChild(n);
    });
  }

  /** Notify the hero canvas (matching.js) so the visual narrates the flow. */
  function emit(name) {
    try {
      window.dispatchEvent(new CustomEvent(name));
    } catch (e) {
      /* decorative only */
    }
  }

  /* ---------- the reveal moment: typographic scramble ---------- */

  var SCRAMBLE_GLYPHS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /** Resolve `el`'s text from noise, left to right (skipped under reduced motion). */
  function scrambleIn(el) {
    if (!el || prefersReduced) return;
    var finalText = el.textContent;
    var DURATION = 900;
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / DURATION, 1);
      var settled = Math.floor(t * finalText.length);
      var out = finalText.slice(0, settled);
      for (var i = settled; i < finalText.length; i++) {
        var ch = finalText[i];
        out += /[a-zA-Z]/.test(ch)
          ? SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0]
          : ch;
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = finalText;
    }
    requestAnimationFrame(frame);
  }

  /* ---------- tier strip (legend for the live score) ---------- */

  var TIERS = [
    { range: "85-100", name: "Excellent match", min: 85, max: 100 },
    { range: "70-84", name: "Good match", min: 70, max: 84 },
    { range: "50-69", name: "Potential match", min: 50, max: 69 },
    { range: "< 50", name: "Limited fit", min: 0, max: 49 },
  ];

  function buildTierStrip(total) {
    var strip = el("div", "mtf-tierstrip");
    TIERS.forEach(function (tier) {
      var active = total >= tier.min && total <= tier.max;
      var cell = el("div", "mtf-tier" + (active ? " is-active" : ""));
      cell.appendChild(el("span", "mtf-tier-range", tier.range));
      cell.appendChild(el("span", "mtf-tier-name", tier.name));
      strip.appendChild(cell);
    });
    return strip;
  }

  /* ---------- score card (reuses the .mt-score styles) ---------- */

  function scoreNote(score) {
    return score.tier === "excellent"
      ? "Exceptional alignment between your family profile and this agency's placement focus."
      : "Solid compatibility with clear areas of alignment. Worth exploring further.";
  }

  function buildScoreCard(score) {
    var card = el("div", "mt-score mtf-scorecard");

    var head = el("div", "mt-score-head");
    var figure = el("div", "mt-score-figure");
    var num = el("span", "mt-score-num", prefersReduced ? String(score.total) : "0");
    figure.appendChild(num);
    figure.appendChild(el("span", "mt-score-max", "/ 100"));

    var meta = el("div", "mt-score-meta");
    meta.appendChild(el("span", "mt-score-badge", score.tierLabel));
    meta.appendChild(el("p", "mt-score-note", scoreNote(score)));

    head.appendChild(figure);
    head.appendChild(meta);
    card.appendChild(head);

    var list = el("ul", "mt-factors");
    (score.factors || []).forEach(function (f) {
      var li = el("li", "mt-factor");
      li.appendChild(el("span", "mt-factor-name", f.name));
      var track = el("span", "mt-factor-track");
      var fill = el("span", "mt-factor-fill");
      var pct = f.max ? Math.round((f.points / f.max) * 100) : 0;
      fill.style.setProperty("--w", pct + "%");
      track.appendChild(fill);
      li.appendChild(track);
      li.appendChild(el("span", "mt-factor-pts", "+" + f.points));
      list.appendChild(li);
    });
    card.appendChild(list);

    // editorial.js only wires the first [data-countup] at page load and the
    // bar fills need .is-in, so this injected card animates itself.
    if (prefersReduced) {
      card.classList.add("is-in");
    } else {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          card.classList.add("is-in");
        });
      });
      var start = null;
      var DURATION = 900;
      function tick(ts) {
        if (start === null) start = ts;
        var t = Math.min((ts - start) / DURATION, 1);
        var eased = 1 - Math.pow(1 - t, 3);
        num.textContent = String(Math.round(eased * score.total));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    return card;
  }

  /* ---------- agency card ---------- */

  function initialsFor(name) {
    var words = String(name || "").replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/);
    var letters = words
      .filter(function (w) { return w.length > 0; })
      .slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); });
    return letters.join("") || "HL";
  }

  function buildAgencyCard(agency) {
    var card = el("article", "mtf-agency");

    var head = el("div", "mtf-agency-head");
    if (agency.logo) {
      var img = document.createElement("img");
      img.className = "mtf-agency-logo";
      img.src = agency.logo;
      img.alt = agency.name + " logo";
      head.appendChild(img);
    } else {
      head.appendChild(el("span", "mtf-agency-lockup", initialsFor(agency.name)));
    }

    var idBlock = el("div", "mtf-agency-id");
    var nameRow = el("div", "mtf-agency-namerow");
    nameRow.appendChild(el("h3", "mtf-agency-name", agency.name));
    if (agency.partner) {
      nameRow.appendChild(el("span", "mtf-partner-badge", "HavenLink partner"));
    }
    idBlock.appendChild(nameRow);
    idBlock.appendChild(
      el("p", "mtf-agency-state", "Licensed agency serving " + stateName(agency.state))
    );
    head.appendChild(idBlock);
    card.appendChild(head);

    card.appendChild(el("p", "mtf-agency-desc", agency.description));

    if (agency.tags && agency.tags.length) {
      var tags = el("ul", "mtf-tags");
      agency.tags.forEach(function (t) {
        tags.appendChild(el("li", "mtf-tag", t));
      });
      card.appendChild(tags);
    }

    if (agency.url) {
      var link = el("a", "hm-textlink mtf-agency-link", "Visit their website ↗");
      link.href = agency.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.appendChild(link);
    }

    return card;
  }

  /* ---------- views ---------- */

  function renderLoading() {
    render("loading", [el("p", "mtf-loading", "Checking your matching status…")]);
  }

  function renderError(message) {
    var wrap = el("div", "mtf-panel");
    wrap.appendChild(el("h3", "mtf-title", "Something went wrong."));
    wrap.appendChild(el("p", "mtf-sub", message));
    var retry = el("button", "hm-btn hm-btn--ink", "Try again");
    retry.type = "button";
    retry.addEventListener("click", loadStatus);
    wrap.appendChild(retry);
    render("error", [wrap]);
  }

  function checklistRow(done, title, note, linkHref, linkText) {
    var li = el("li", "mtf-check" + (done ? " mtf-check-done" : ""));
    li.appendChild(el("span", "mtf-check-mark", done ? "✓" : ""));
    var body = el("div", "mtf-check-body");
    body.appendChild(el("span", "mtf-check-title", title));
    if (note) body.appendChild(el("p", "mtf-check-note", note));
    li.appendChild(body);
    if (done) {
      li.appendChild(el("span", "mtf-check-status", "Complete"));
    } else {
      var a = el("a", "hm-textlink", linkText);
      a.href = linkHref;
      li.appendChild(a);
    }
    return li;
  }

  function renderIneligible(data) {
    var e = data.eligibility || {};
    var wrap = el("div", "mtf-panel");
    wrap.appendChild(el("p", "hm-eyebrow mtf-kicker", "Before you match"));
    wrap.appendChild(el("h3", "mtf-title", "Two steps unlock your match."));
    wrap.appendChild(
      el(
        "p",
        "mtf-sub",
        "Matching needs your completed intake form and home study — they tell us who you are and where you are, so we can pair you with the right licensed agency."
      )
    );

    var list = el("ul", "mtf-checklist");
    list.appendChild(
      checklistRow(
        !!e.intakeCompleted,
        "Family Intake Form",
        "Your family profile, preferences, and state of residence.",
        "/adopt/intake-form",
        "Go to the intake form"
      )
    );

    var hsNote = "Confirm a completed home study, or take the readiness screener.";
    if (e.homeStudyResult === "NOT_YET_ELIGIBLE") {
      hsNote =
        "Your readiness check came back not-yet-eligible. Revisit the home study when your circumstances change — matching unlocks once it passes.";
    } else if (e.homeStudyResult === "INTERNATIONAL") {
      hsNote =
        "Your home study indicated an international adoption path, which matching doesn't support yet. See the home study page for USCIS guidance.";
    }
    list.appendChild(
      checklistRow(
        !!e.homeStudyComplete,
        "Home Study",
        hsNote,
        "/adopt/home-study",
        "Start the home study"
      )
    );
    wrap.appendChild(list);
    render("ineligible", [wrap]);
  }

  function renderUnsupported(data) {
    var name = stateName(data.state);
    var wrap = el("div", "mtf-panel");
    wrap.appendChild(el("p", "hm-eyebrow mtf-kicker", "Not there yet"));
    wrap.appendChild(
      el("h3", "mtf-title", "HavenLink hasn't established outreach in " + name + " yet.")
    );
    wrap.appendChild(
      el(
        "p",
        "mtf-sub",
        "We're building our agency network state by state, and " +
          name +
          " isn't covered yet. Your profile is saved — matching will light up here the moment we arrive."
      )
    );
    var back = el("a", "hm-textlink", "See how agency profiles work");
    back.href = "/adopt/agency-profiles";
    wrap.appendChild(back);
    render("unsupported", [wrap]);
  }

  function renderReady(data) {
    var wrap = el("div", "mtf-panel");
    wrap.appendChild(el("p", "hm-eyebrow mtf-kicker", "You're eligible"));
    wrap.appendChild(el("h3", "mtf-title", "Your profile is complete. Let's find your agency."));
    var sub = data.partnerState
      ? "Good news — " +
        stateName(data.state) +
        " is served by a HavenLink partner agency. We'll pair you directly with a partner we work with hand in hand."
      : "We'll match you with one of " +
        (data.poolSize || "several") +
        " licensed agencies serving " +
        stateName(data.state) +
        ". Review the match, explore the agency's site, and confirm when it feels right.";
    wrap.appendChild(el("p", "mtf-sub", sub));

    var btn = el("button", "hm-btn hm-btn--ink mtf-begin", "Begin match");
    btn.type = "button";
    btn.addEventListener("click", function () {
      roll(btn);
    });
    wrap.appendChild(btn);
    render("ready", [wrap]);
  }

  function renderCandidate(payload) {
    var agency = payload.candidate.agency;
    var score = payload.candidate.score;

    var wrap = el("div", "mtf-panel");
    wrap.appendChild(el("p", "hm-eyebrow mtf-kicker", "Your match"));
    wrap.appendChild(el("h3", "mtf-title", "Meet your match."));
    wrap.appendChild(
      el(
        "p",
        "mtf-sub",
        payload.partnerState
          ? "A HavenLink partner — hand-selected, verified, and ready for you. Take a look around their site, then confirm the match to introduce yourself."
          : "Take your time: explore the agency's site and see if it feels right. Confirm to send the match to HavenLink, or ask for another agency."
      )
    );

    var agencyCard = buildAgencyCard(agency);
    wrap.appendChild(agencyCard);
    wrap.appendChild(buildScoreCard(score));
    wrap.appendChild(buildTierStrip(score.total));

    var actions = el("div", "mtf-actions");
    var err = el("p", "mtf-error");
    err.hidden = true;

    var confirmBtn = el("button", "hm-btn hm-btn--ink", "Confirm this match");
    confirmBtn.type = "button";
    confirmBtn.addEventListener("click", function () {
      confirmMatch(agency.id, confirmBtn, err);
    });
    actions.appendChild(confirmBtn);

    if (!payload.partnerState) {
      var rerollBtn = el("button", "hm-btn mtf-reroll", "Show me another");
      rerollBtn.type = "button";
      rerollBtn.addEventListener("click", function () {
        roll(rerollBtn);
      });
      actions.appendChild(rerollBtn);
      if (payload.poolSize) {
        actions.appendChild(
          el(
            "span",
            "mtf-counter",
            "Reviewed " + payload.seenCount + " of " + payload.poolSize + " agencies"
          )
        );
      }
    }

    wrap.appendChild(actions);
    wrap.appendChild(err);
    render("candidate", [wrap]);
    scrambleIn(agencyCard.querySelector(".mtf-agency-name"));
    emit("havenlink:match-roll");
  }

  function renderMatched(match) {
    var wrap = el("div", "mtf-panel");
    wrap.appendChild(el("p", "hm-eyebrow mtf-kicker", "Match confirmed"));

    if (!match || !match.agency) {
      wrap.appendChild(el("h3", "mtf-title", "Your match is confirmed."));
      wrap.appendChild(
        el(
          "p",
          "mtf-sub",
          "HavenLink has your confirmed agency match on file. We'll be in touch — or reach us at havenlink.org@gmail.com."
        )
      );
      render("matched", [wrap]);
      emit("havenlink:matched");
      return;
    }

    var agency = match.agency;
    wrap.appendChild(el("h3", "mtf-title", "It's official — you're matched with " + agency.name + "."));

    var when = "";
    if (match.matchedAt) {
      var d = new Date(match.matchedAt);
      if (!isNaN(d.getTime())) {
        when = d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
    }
    wrap.appendChild(
      el(
        "p",
        "mtf-sub",
        (when ? "Confirmed " + when + ". " : "") +
          "HavenLink has been notified — expect contact from our team within 1–2 business days to coordinate next steps with " +
          agency.name +
          "."
      )
    );

    wrap.appendChild(buildAgencyCard(agency));
    if (match.score) {
      wrap.appendChild(buildScoreCard(match.score));
      wrap.appendChild(buildTierStrip(match.score.total));
    }
    render("matched", [wrap]);
    emit("havenlink:matched");
  }

  /* ---------- actions ---------- */

  function busy(btn, label) {
    btn.disabled = true;
    btn.dataset.label = btn.textContent;
    btn.textContent = label;
  }

  function unbusy(btn) {
    btn.disabled = false;
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  async function roll(btn) {
    if (btn) busy(btn, "Matching…");
    try {
      var res = await postJson("/api/match/roll", {});
      if (res.ok) {
        renderCandidate(res.data);
        return;
      }
      var code = res.data && res.data.code;
      if (code === "ALREADY_MATCHED" || code === "INELIGIBLE") {
        loadStatus();
      } else if (code === "UNSUPPORTED_STATE") {
        renderUnsupported({ state: res.data.state });
      } else {
        renderError(res.data.error || "We couldn't run the match. Please try again.");
      }
    } catch (e) {
      renderError("We couldn't reach HavenLink. Check your connection and try again.");
    } finally {
      if (btn) unbusy(btn);
    }
  }

  async function confirmMatch(agencyId, btn, errEl) {
    busy(btn, "Confirming…");
    try {
      var res = await postJson("/api/match/confirm", { agencyId: agencyId });
      if (res.ok) {
        renderMatched(res.data.match);
        return;
      }
      var code = res.data && res.data.code;
      if (code === "NO_ACTIVE_CANDIDATE") {
        // Session lost its candidate (expiry/re-login) - transparently re-roll.
        roll(null);
      } else if (code === "ALREADY_MATCHED") {
        loadStatus();
      } else {
        errEl.textContent =
          (res.data && res.data.error) ||
          "We couldn't confirm the match. Please try again.";
        errEl.hidden = false;
      }
    } catch (e) {
      errEl.textContent = "We couldn't reach HavenLink. Check your connection and try again.";
      errEl.hidden = false;
    } finally {
      unbusy(btn);
    }
  }

  async function loadStatus() {
    renderLoading();
    try {
      var res = await fetch("/api/match", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        renderError("We couldn't load your matching status. Please refresh or log in again.");
        return;
      }
      var data = await res.json();
      if (data.status === "matched") {
        renderMatched(data.match);
      } else if (data.status === "ineligible") {
        renderIneligible(data);
      } else if (data.status === "unsupported") {
        renderUnsupported(data);
      } else {
        renderReady(data);
      }
    } catch (e) {
      renderError("We couldn't reach HavenLink. Check your connection and try again.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadStatus);
  } else {
    loadStatus();
  }
})();
