/**
 * Financial Calculator (Step 4) — front end.
 *
 * Posts the form to POST /api/calculator/estimate and renders the result: headline,
 * three blocks, ongoing support, timeline, the always-visible foster-care comparison,
 * and a collapsed "show me the math" drawer with a source link per line item.
 *
 * Security / privacy notes:
 *  - Estimates go out as a POST, never a GET, so the income band never lands in a
 *    URL, an access log, or browser history.
 *  - State-changing requests fetch a fresh CSRF token from /auth/csrf and echo it in
 *    the `x-csrf-token` header, matching account.js and match-flow.js.
 *  - Every value that reaches the DOM goes through esc() or textContent. Line-item
 *    labels and source URLs come from the database, so they are treated as untrusted.
 *
 * Vanilla IIFE to match the rest of public/.
 */
(function () {
  "use strict";

  var form = document.getElementById("fc-form");
  if (!form) return; // no-op on every page except the calculator

  /* US states + DC, same list the intake form uses. */
  var US_STATES = [
    ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
    ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
    ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
    ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
    ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
    ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
    ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
    ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
    ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
    ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
    ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
    ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
    ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"]
  ];

  var els = {
    state: document.getElementById("fc-state"),
    stateHint: document.getElementById("fc-state-hint"),
    type: document.getElementById("fc-type"),
    household: document.getElementById("fc-household"),
    income: document.getElementById("fc-income"),
    filing: document.getElementById("fc-filing"),
    employer: document.getElementById("fc-employer"),
    military: document.getElementById("fc-military"),
    special: document.getElementById("fc-special"),
    submit: document.getElementById("fc-submit"),
    msg: document.getElementById("fc-msg"),
    results: document.getElementById("fc-results"),
    banner: document.getElementById("fc-banner"),
    headlineFigure: document.getElementById("fc-headline-figure"),
    headlineRead: document.getElementById("fc-headline-read"),
    asOf: document.getElementById("fc-asof"),
    costs: document.getElementById("fc-costs"),
    back: document.getElementById("fc-back"),
    net: document.getElementById("fc-net"),
    branches: document.getElementById("fc-branches"),
    branchesLede: document.getElementById("fc-branches-lede"),
    forkHead: document.getElementById("fc-fork-head"),
    forkRows: document.getElementById("fc-fork-rows"),
    support: document.getElementById("fc-support"),
    ongoingNote: document.getElementById("fc-ongoing-note"),
    timeline: document.getElementById("fc-timeline"),
    compare: document.getElementById("fc-compare"),
    notesBlock: document.getElementById("fc-notes-block"),
    notes: document.getElementById("fc-notes"),
    mathRows: document.getElementById("fc-math-rows"),
    mathReimbTable: document.getElementById("fc-math-reimb-table"),
    mathReimb: document.getElementById("fc-math-reimb"),
    mathCredit: document.getElementById("fc-math-credit"),
    save: document.getElementById("fc-save"),
    saveMsg: document.getElementById("fc-save-msg"),
    disclaimer: document.getElementById("fc-disclaimer"),
    savedBlock: document.getElementById("fc-saved-block"),
    saved: document.getElementById("fc-saved"),
    /* redesign additions */
    forkDelta: document.getElementById("fc-fork-delta"),
    abLabelA: document.getElementById("fc-ab-label-a"),
    abFigureA: document.getElementById("fc-ab-figure-a"),
    abFigureB: document.getElementById("fc-ab-figure-b"),
    abRead: document.getElementById("fc-ab-read"),
    ongoingFigure: document.getElementById("fc-ongoing-figure"),
    ongoingFigureLabel: document.getElementById("fc-ongoing-figure-label"),
    ongoingFigureDetail: document.getElementById("fc-ongoing-figure-detail"),
    tideSvg: document.getElementById("fc-tide-svg"),
    tideCaption: document.getElementById("fc-tide-caption"),
    tideTrack: document.getElementById("fc-tide-track"),
    tideStage: document.getElementById("fc-tide-stage"),
    timelineBlock: document.getElementById("fc-timeline-block")
  };

  var motionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  var prefersReduced = !!(motionQuery && motionQuery.matches);
  if (motionQuery && motionQuery.addEventListener) {
    motionQuery.addEventListener("change", function (e) { prefersReduced = e.matches; });
  }

  /* The inputs behind the estimate currently on screen. Save re-sends these so the
     server recomputes rather than trusting anything we hold client-side. */
  var currentPayload = null;

  /* ------------------------------------------------------------------ helpers */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Hoisted: toLocaleString re-derives an Intl instance on some engines, which is
     exactly the per-frame allocation the count-up below is trying to avoid. */
  var NUM = window.Intl && Intl.NumberFormat ? new Intl.NumberFormat("en-US") : null;

  function money(cents) {
    var d = Math.round(cents / 100);
    return "$" + (NUM ? NUM.format(d) : d.toLocaleString("en-US"));
  }

  /** Never a bare number: a point value still renders as one explicit figure. */
  function moneyRange(r) {
    if (!r) return "—";
    return r.low === r.high ? money(r.low) : money(r.low) + " – " + money(r.high);
  }

  /* ---------------------------------------------------------------- motion */

  /* Same options as editorial.js so the whole page keeps one reveal signature. */
  var REVEAL_OPTS = { threshold: 0.15, rootMargin: "0px 0px -10% 0px" };
  var localReveal = null;

  /**
   * editorial.js queries .hm-reveal once at defer time and unobserves on first
   * intersect, so it can neither see the markup this file injects nor replay a
   * second submit. This is the page-local equivalent, same contract.
   */
  function revealIn(root) {
    var nodes = Array.prototype.slice.call(root.querySelectorAll(".hm-reveal"));
    if (root.classList && root.classList.contains("hm-reveal")) nodes.push(root);
    if (!nodes.length) return;

    /* Strip so a repeat submit animates again. Safe: editorial.js's observer only
       ever ADDS the class, so a node it is still holding simply gets it back. */
    nodes.forEach(function (n) { n.classList.remove("is-in"); });

    /* document.hidden matters as much as the motion preference: in a backgrounded
       tab rAF never fires, so an animation-gated reveal would leave the results
       sitting at opacity 0 with nothing to un-hide them. */
    if (prefersReduced || document.hidden || !("IntersectionObserver" in window)) {
      nodes.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }

    if (localReveal) localReveal.disconnect(); // never leak one observer per submit
    localReveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        localReveal.unobserve(e.target);
      });
    }, REVEAL_OPTS);

    /* Let the "out" state paint before arming, or the transition is skipped. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        nodes.forEach(function (n) { localReveal.observe(n); });
      });
    });
  }

  var COUNT_MS = 900; // matches editorial.js

  /**
   * Animate a low–high money pair in one rAF, with editorial.js's easing and
   * duration. The format is decided once from the TARGET, because moneyRange()
   * collapses to a single figure when low === high and both boundaries start at
   * zero — a naive version renders "$0" on frame one, then pops into a pair.
   */
  function countRange(el, target) {
    if (!el || !target) return;
    var lo = target.low, hi = target.high;
    var point = lo === hi;
    var last = "";

    function paint(a, b) {
      var s = point ? money(a) : money(a) + " – " + money(b);
      if (s !== last) { last = s; el.textContent = s; } // skip the layout invalidation
    }

    /* Same reasoning as revealIn: with no rAF the figure would be stranded at the
       first frame's "$0", so write the real number and skip the animation. */
    if (prefersReduced || document.hidden || !window.requestAnimationFrame) {
      el.textContent = moneyRange(target);
      return;
    }

    var start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var t = (ts - start) / COUNT_MS;
      if (t >= 1) {
        /* Snap to the canonical string so the animated figure is character-
           identical to what the static renderer would have produced. */
        el.textContent = moneyRange(target);
        return;
      }
      var eased = 1 - Math.pow(1 - t, 3);
      paint(eased * lo, eased * hi); // interpolate in CENTS; money() rounds
      requestAnimationFrame(tick);
    }
    paint(0, 0);
    requestAnimationFrame(tick);
  }

  function showMsg(el, kind, text) {
    el.textContent = text;
    el.className = "fc-msg show " + kind;
  }

  function hideMsg(el) {
    el.textContent = "";
    el.className = "fc-msg";
  }

  function setLoading(on) {
    els.submit.disabled = on;
    var label = els.submit.querySelector(".fc-submit-label");
    if (label) label.textContent = on ? "Working…" : "Show me the numbers";
  }

  /**
   * Append a <dt>/<dd> pair. Both sides are set as text, never as markup.
   *
   * opts.note is the escape hatch for PROSE. The value column is
   * `white-space: nowrap` — that is what keeps the money figures in a tabular
   * column — so a sentence put through it has a min-content width of the whole
   * sentence, which the grid's auto track cannot shrink below. That is how a
   * 150-character subsidy footnote used to push the entire document sideways.
   * A note is one full-width, wrapping element with no <dt> at all, so it can
   * never interact with the money track.
   */
  function addRow(dl, label, value, opts) {
    opts = opts || {};
    if (opts.note) {
      var note = document.createElement("dd");
      note.className = "fc-row-note";
      note.textContent = label;
      dl.appendChild(note);
      return;
    }
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = value;
    if (opts.strong) {
      dt.className = "fc-row-strong";
      dd.className = "fc-row-strong";
    }
    if (opts.sub) {
      dt.className = "fc-row-sub";
      dd.className = "fc-row-sub";
    }
    /* Some right-hand values are words, not figures ("None (full credit)").
       Held in the tabular column they are nowrap, so they set that column's
       width and squeeze the label beside them into a four-line rag. */
    if (opts.words) dd.className += " fc-row-words";
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /* ------------------------------------------------------------------- CSRF */

  async function getCsrfToken() {
    var res = await fetch("/auth/csrf", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new Error("Could not get CSRF token");
    var data = await res.json();
    return data.csrfToken;
  }

  async function postJson(url, body) {
    var csrfToken = await getCsrfToken();
    var res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(body)
    });
    var data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* no body */
    }
    return { ok: res.ok, status: res.status, data: data };
  }

  /* ------------------------------------------------------------------- form */

  function buildStates() {
    US_STATES.forEach(function (pair) {
      var opt = document.createElement("option");
      opt.value = pair[0];
      opt.textContent = pair[1];
      els.state.appendChild(opt);
    });
  }

  /**
   * Prefill the state from the signed-in account (Step 1/2 already captured it).
   * Everything else is asked, because intake answers are not stored on the account.
   */
  async function prefillState() {
    try {
      var res = await fetch("/auth/me", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      var data = await res.json();
      var state = data && data.user && data.user.state;
      if (state && els.state.querySelector('option[value="' + CSS.escape(state) + '"]')) {
        els.state.value = state;
        els.stateHint.textContent = "Prefilled from your account. Change it if it is wrong.";
      }
    } catch (e) {
      /* prefill is a convenience; never block the form on it */
    }
  }

  function readForm() {
    var dollars = Number(els.employer.value);
    if (!isFinite(dollars) || dollars < 0) dollars = 0;
    return {
      state: els.state.value,
      adoptionType: els.type.value,
      householdSize: Number(els.household.value),
      incomeBand: els.income.value,
      filingStatus: els.filing.value,
      employerBenefitCents: Math.round(dollars * 100),
      militaryStatus: els.military.checked,
      specialNeeds: els.special.value
    };
  }

  /* ---------------------------------------------------------------- rendering */

  /**
   * The two futures, side by side in one table.
   *
   * The tax-credit row the old two-card version carried is deliberately gone:
   * it is already the closing line of the "What comes back" card above, and
   * this block exists to answer one question — what does the determination
   * change? Only the rows that actually move belong here.
   */
  function sameRange(a, b) {
    return a.low === b.low && a.high === b.high;
  }

  function renderFork(yes, no) {
    clear(els.forkHead);
    clear(els.forkRows);

    var rows = [
      ["Cash needed up front", yes.cashUpFront, no.cashUpFront],
      ["Net cost after credits", yes.netAfterCredits, no.netAfterCredits]
    ];

    /* On some paths — Florida's foster care among them — the determination
       changes no cost at all. Printing two identical money columns is the exact
       duplication this table replaced, so collapse to one and say so in the
       heading. The server's note promises both outcomes are shown; one column
       covering both keeps that true. */
    var identical = rows.every(function (r) { return sameRange(r[1], r[2]); });
    var heads = identical
      ? ["Either way"]
      : ["If a state determines special needs", "If it does not"];

    els.forkHead.appendChild(document.createElement("td"));
    heads.forEach(function (label) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      els.forkHead.appendChild(th);
    });

    rows.forEach(function (row) {
      var tr = document.createElement("tr");

      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = row[0];
      tr.appendChild(th);

      var values = identical ? [row[1]] : [row[1], row[2]];
      values.forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = moneyRange(v);
        tr.appendChild(td);
      });
      els.forkRows.appendChild(tr);
    });

    return identical;
  }

  function renderCosts(branch) {
    clear(els.costs);
    addRow(els.costs, "Gross cost", moneyRange(branch.gross));
    if (branch.employerBenefitApplied.high > 0) {
      addRow(els.costs, "Less employer benefit", "− " + moneyRange(branch.employerBenefitApplied));
    }
    branch.reimbursementPrograms.forEach(function (p) {
      addRow(els.costs, "Less " + p.name, "− " + moneyRange(p.amount), { sub: true });
    });
    addRow(els.costs, "Cash needed up front", moneyRange(branch.cashUpFront), { strong: true });
  }

  function renderBack(branch) {
    var c = branch.taxCredit;
    clear(els.back);
    addRow(els.back, "Federal credit after phase-out", moneyRange(c.total));
    addRow(els.back, "of which refundable", moneyRange(c.refundable), { sub: true });
    addRow(els.back, "of which usable against tax owed", moneyRange(c.nonRefundableUsable), { sub: true });
    if (c.nonRefundableCarryforward.high > 0) {
      addRow(els.back, "carried forward (up to 5 years)", moneyRange(c.nonRefundableCarryforward), { sub: true });
    }
    if (c.stateCredit) {
      addRow(els.back, c.stateCreditName || "State credit", moneyRange(c.stateCredit));
    }
    addRow(els.back, "What actually comes back", moneyRange(c.usable), { strong: true });

    if (branch.taxCreditAtBandEdges) {
      addRow(els.back, "At the bottom of your income band",
        moneyRange(branch.taxCreditAtBandEdges.low.total), { sub: true });
      addRow(els.back, "At the top of your income band",
        moneyRange(branch.taxCreditAtBandEdges.high.total), { sub: true });
    }
  }

  function renderNet(branch) {
    clear(els.net);
    addRow(els.net, "Net cost after credits", moneyRange(branch.netAfterCredits), { strong: true });
    /* Estimated federal liability lives in the sources drawer, where it is one of
       five credit internals. Repeating it here made a summary card into a third
       arithmetic table. */
    addRow(els.net, "Credit phase-out applied",
      branch.taxCredit.phaseoutFactor === 1
        ? "None (full credit)"
        : branch.taxCredit.phaseoutFactor === 0
          ? "Fully phased out"
          : Math.round(branch.taxCredit.phaseoutFactor * 100) + "% of the credit remains",
      { sub: true, words: true });
  }

  /**
   * One support programme: name and amount on a row, its sourced sentence on a
   * full-width row beneath. Built as a list rather than a <dl> because the
   * detail strings run to 150 characters and prose has no business in a
   * tabular money column.
   */
  function addSupport(name, amount, detail) {
    var li = document.createElement("li");
    li.className = "fc-support-item";

    var n = document.createElement("span");
    n.className = "fc-support-name";
    n.textContent = name;
    li.appendChild(n);

    var a = document.createElement("span");
    a.className = "fc-support-amount";
    a.textContent = amount;
    li.appendChild(a);

    if (detail) {
      var d = document.createElement("p");
      d.className = "fc-support-detail";
      d.textContent = detail;
      li.appendChild(d);
    }

    els.support.appendChild(li);
  }

  function renderOngoing(ongoing) {
    clear(els.support);

    /* The monthly figure set large, because it is the one number on this page
       that keeps arriving. Most states negotiate the amount per child rather than
       publishing it, so the slot has to read well with no figure at all. */
    if (ongoing.monthlySubsidy) {
      els.ongoingFigure.textContent = moneyRange(ongoing.monthlySubsidy);
      els.ongoingFigureLabel.textContent =
        "per month · " + (ongoing.monthlySubsidyName || "monthly subsidy");
    } else if (ongoing.monthlySubsidyName) {
      els.ongoingFigure.textContent = "Negotiated";
      els.ongoingFigureLabel.textContent =
        ongoing.monthlySubsidyName + ": the amount is set case by case";
    } else {
      els.ongoingFigure.textContent = "—";
      els.ongoingFigureLabel.textContent = "No monthly subsidy applies to this path";
    }

    /* The statute behind the monthly figure. The old programmes loop skipped the
       monthly row wholesale, so this sentence was fetched and then dropped. */
    if (ongoing.monthlySubsidyDetail) {
      els.ongoingFigureDetail.textContent = ongoing.monthlySubsidyDetail;
      els.ongoingFigureDetail.hidden = false;
    } else {
      els.ongoingFigureDetail.textContent = "";
      els.ongoingFigureDetail.hidden = true;
    }

    ongoing.programs.forEach(function (p) {
      /* The monthly programme is the big figure to the left; listing it again
         here would be the third time the same number appears in one section. */
      if (p.type === "monthly") return;
      var value = p.amountLow === null
        ? "Included"
        : moneyRange({ low: p.amountLow, high: p.amountHigh === null ? p.amountLow : p.amountHigh });
      addSupport(p.name, value, p.detail);
    });

    if (ongoing.explanation) {
      els.ongoingNote.textContent = ongoing.explanation;
      els.ongoingNote.hidden = false;
    } else {
      els.ongoingNote.hidden = true;
    }
  }

  function renderTimeline(timeline) {
    clear(els.timeline);
    timeline.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "fc-timeline-item fc-timeline-item--" + entry.direction;

      var dir = document.createElement("span");
      dir.className = "fc-timeline-dir";
      dir.textContent = entry.direction === "out" ? "Money out" : "Money back";

      var label = document.createElement("span");
      label.className = "fc-timeline-label";
      label.textContent = entry.label;

      var when = document.createElement("span");
      when.className = "fc-timeline-when";
      when.textContent = entry.when;

      li.appendChild(dir);
      li.appendChild(label);
      li.appendChild(when);
      els.timeline.appendChild(li);
    });
  }

  function renderMath(branch) {
    clear(els.mathRows);
    branch.lineItems.forEach(function (item) {
      var tr = document.createElement("tr");

      var tdLabel = document.createElement("td");
      tdLabel.textContent = item.label;
      var link = document.createElement("a");
      link.href = item.sourceUrl;
      link.textContent = "source";
      link.className = "fc-source";
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      tdLabel.appendChild(document.createTextNode(" "));
      tdLabel.appendChild(link);

      var tdRange = document.createElement("td");
      tdRange.textContent = moneyRange({ low: item.low, high: item.high });

      var tdYear = document.createElement("td");
      tdYear.textContent = String(item.effectiveYear);

      tr.appendChild(tdLabel);
      tr.appendChild(tdRange);
      tr.appendChild(tdYear);
      els.mathRows.appendChild(tr);
    });

    clear(els.mathReimb);
    if (branch.reimbursementPrograms.length > 0) {
      els.mathReimbTable.hidden = false;
      branch.reimbursementPrograms.forEach(function (p) {
        var tr = document.createElement("tr");
        var tdName = document.createElement("td");
        tdName.textContent = p.name;
        var tdAmount = document.createElement("td");
        tdAmount.textContent = money(p.amount.high);
        var tdSrc = document.createElement("td");
        var a = document.createElement("a");
        a.href = p.sourceUrl;
        a.textContent = "source";
        a.className = "fc-source";
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        tdSrc.appendChild(a);
        tr.appendChild(tdName);
        tr.appendChild(tdAmount);
        tr.appendChild(tdSrc);
        els.mathReimb.appendChild(tr);
      });
    } else {
      els.mathReimbTable.hidden = true;
    }

    var c = branch.taxCredit;
    clear(els.mathCredit);
    addRow(els.mathCredit, "Income the credit was computed at", money(c.computedAtIncome));
    addRow(els.mathCredit, "Phase-out factor applied", c.phaseoutFactor.toFixed(3));
    addRow(els.mathCredit, "Estimated federal tax liability", money(c.estimatedLiability));
    addRow(els.mathCredit, "Credit before the liability cap", moneyRange(c.total));
    addRow(els.mathCredit, "Credit actually usable this year", moneyRange(c.usable));
  }

  function renderNotes(notes) {
    clear(els.notes);
    if (!notes.length) {
      els.notesBlock.hidden = true;
      return;
    }
    notes.forEach(function (n, i) {
      var li = document.createElement("li");
      var tick = document.createElement("span");
      tick.className = "ed-tick";
      tick.textContent = String(i + 1).padStart(2, "0");
      var body = document.createElement("span");
      body.className = "fc-note-item";
      body.textContent = n.message;
      li.appendChild(tick);
      li.appendChild(body);
      els.notes.appendChild(li);
    });
    els.notesBlock.hidden = false;
  }

  /* ------------------------------------------------------------- tide plate */

  /* The signature graphic. Everything here is progressive enhancement over the
     <ol id="fc-timeline"> list, which stays in the DOM as the accessible base,
     the no-JS fallback, and the fallback when the plate's reconciliation
     invariant fails. */

  var tidePin = window.matchMedia ? window.matchMedia("(min-width: 901px)") : null;
  var tidePlate = null;   // the derived model
  var tideCtl = null;     // the controller returned by HL_TIDE.render
  var tideBand = "";      // which label policy is currently mounted
  var tideSize = null;    // the {w,h} box the current SVG was generated for
  var tideTop = 0;
  var tideRange = 1;

  /* Resolved through matchMedia, not window.innerWidth, so the viewBox the plate
     mounts can never disagree with the media query that decides whether the pin
     and the per-event labels are in play. */
  var midQuery = window.matchMedia ? window.matchMedia("(min-width: 601px)") : null;

  function bandFor() {
    if (tidePin && tidePin.matches) return "wide";
    if (midQuery && midQuery.matches) return "mid";
    return "narrow";
  }

  /**
   * Park the stage below whatever sticky chrome is actually above it.
   *
   * The stylesheet's fallback assumes the adopt progress bar is 3.4rem tall; it
   * is nearer 5.3rem at desktop, so the top of the plate — which is where the
   * zero rule and the live readout live — came to rest underneath it. Measure
   * rather than guess, since the bar changes height across breakpoints.
   */
  function measureStickyTop() {
    var section = els.tideTrack ? els.tideTrack.closest(".fc-tide") : null;
    if (!section) return;
    var bottom = 0;
    ["#navbar", "#adoptSubnav"].forEach(function (sel) {
      var node = document.querySelector(sel);
      if (!node) return;
      var cs = window.getComputedStyle(node);
      if (cs.position !== "sticky" && cs.position !== "fixed") return;
      bottom = Math.max(bottom, node.getBoundingClientRect().height +
        (parseFloat(cs.top) || 0));
    });
    if (bottom > 0) {
      section.style.setProperty("--fc-sticky-top", Math.ceil(bottom) + "px");
    }
  }

  function measureTide() {
    if (!els.tideTrack || !els.tideStage) return;
    measureStickyTop();
    var rect = els.tideTrack.getBoundingClientRect();
    /* Stickiness begins when the track's top reaches the stage's `top` offset,
       not when it reaches the viewport's top — so the scrub's origin is that
       many pixels earlier. Without this the parameter reached 1 only after the
       stage had already released, and the last stretch of the scroll dragged
       the plate up under the progress bar. */
    var stickyTop = parseFloat(window.getComputedStyle(els.tideStage).top);
    if (!isFinite(stickyTop)) stickyTop = 0;
    tideTop = rect.top + window.scrollY - stickyTop;
    tideRange = Math.max(els.tideTrack.offsetHeight - els.tideStage.offsetHeight, 1);
  }

  function updateTide() {
    if (!els.tideStage || !tideCtl) return;

    /* Unlike home.js, an inactive pin RESETS rather than early-returning: a stale
       --tide-p of 0 after a resize across the breakpoint would leave the ribbon
       clipped to nothing. */
    if (!tidePin || !tidePin.matches || prefersReduced) {
      els.tideStage.style.setProperty("--tide-p", "1");
      tideCtl.paint(1);
      return;
    }

    var p = (window.scrollY - tideTop) / tideRange;
    p = p < 0 ? 0 : (p > 1 ? 1 : p);
    els.tideStage.style.setProperty("--tide-p", p.toFixed(4));
    tideCtl.paint(p);
  }

  var tideQueued = false;
  function onTideScroll() {
    if (tideQueued) return;
    tideQueued = true;
    requestAnimationFrame(function () { tideQueued = false; updateTide(); });
  }

  function plateBox() {
    if (!els.tideSvg) return null;
    var r = els.tideSvg.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }

  function mountTide() {
    if (!tidePlate || !els.tideSvg || !window.HL_TIDE) return;

    /* The plate's viewBox is generated from this box, so a collapsed one would
       bake in a broken geometry for the life of the render. Retry instead —
       #fc-results was only just unhidden and the stage may not have laid out. */
    var box = plateBox();
    if (!box || box.w < 2 || box.h < 2) {
      requestAnimationFrame(mountTide);
      return;
    }

    tideBand = bandFor();
    tideSize = box;
    tideCtl = window.HL_TIDE.render(els.tideSvg, tidePlate, tideBand);
    /* Below the label breakpoint the plate shows shape only, so the list beneath
       carries the detail — open it rather than hiding the information. */
    if (els.timelineBlock) els.timelineBlock.open = !tideCtl.view.labels;
    measureTide();
    updateTide();
  }

  /**
   * Geometry is measured now, so ANY change to the box needs a re-render — not
   * just crossing a breakpoint, which is all the old handler watched.
   *
   * The dead band matters: re-rendering nudges the box by a sub-pixel, and
   * without it the ResizeObserver below would fire on its own output forever.
   */
  var tideResizeTimer = null;
  function onTideResize() {
    measureTide();
    updateTide();               /* keep the scrub honest on the very next frame */
    clearTimeout(tideResizeTimer);
    tideResizeTimer = setTimeout(function () {
      if (!tidePlate) return;
      var box = plateBox();
      if (!box || box.w < 2 || box.h < 2) return;
      if (bandFor() !== tideBand || !tideSize ||
          Math.abs(box.w - tideSize.w) > 2 || Math.abs(box.h - tideSize.h) > 2) {
        mountTide();
      }
    }, 140);
  }

  function renderTide(result, branch) {
    var section = els.tideTrack ? els.tideTrack.closest(".fc-tide") : null;

    tidePlate = window.HL_TIDE ? window.HL_TIDE.derive(result, branch) : null;
    if (!tidePlate) {
      /* The accumulated line items did not reproduce the server's own gross, so
         we have no business drawing anything. Show the list instead. */
      tideCtl = null;
      if (els.tideSvg) clear(els.tideSvg);
      if (section) section.setAttribute("data-plate", "off");
      if (els.timelineBlock) els.timelineBlock.open = true;
      if (els.tideCaption) els.tideCaption.textContent = "";
      return;
    }

    /* The SVG itself is mounted at the tail of render(), once #fc-results is
       visible — a plate built while the track still has zero height cannot be
       measured for the scrub. */
    if (section) section.setAttribute("data-plate", "on");

    if (els.tideCaption) {
      /* The two levels coincide whenever no employer benefit and no one-time
         reimbursement move the line — which is the common case. Saying a figure
         "falls to" itself reads like a bug, so only claim a fall when there is one. */
      var fell = tidePlate.plateau.low !== tidePlate.trough.low ||
                 tidePlate.plateau.high !== tidePlate.trough.high;
      els.tideCaption.textContent = fell
        ? "Peak outlay is " + moneyRange(tidePlate.trough) + ", falling to " +
          moneyRange(tidePlate.plateau) + " once one-time reimbursements are paid. " +
          "The band between the two lines is the range we cannot narrow."
        : "Peak outlay is " + moneyRange(tidePlate.trough) + ", and nothing comes back " +
          "before finalization. The band between the two lines is the range we cannot narrow.";
    }
  }

  if (els.tideTrack) {
    window.addEventListener("scroll", onTideScroll, { passive: true });
    window.addEventListener("resize", onTideResize);
    /* Fonts and images settling shift the track's document offset. */
    window.addEventListener("load", function () { measureTide(); updateTide(); });
    /* Crossing the pin breakpoint changes the stage height, so it changes the
       box, so it changes the viewBox — a remeasure alone is not enough. */
    if (tidePin && tidePin.addEventListener) {
      tidePin.addEventListener("change", onTideResize);
    }
    /* resize alone misses scrollbar appearance, browser zoom, and the mobile
       toolbar's svh dance — all of which resize the plate. */
    if (window.ResizeObserver && els.tideSvg) {
      new window.ResizeObserver(onTideResize).observe(els.tideSvg);
    }
  }

  /* ---------------------------------------------------------------- render */

  function render(payload) {
    var result = payload.result;
    var branch = result.primary;

    // Fallback banner. The wording comes from the server note rather than being
    // rebuilt here, so the banner and the notes list can never disagree — and the
    // server's copy names the adoption type, which matters because coverage is
    // per state AND path.
    var fallbackNote = result.notes.filter(function (n) {
      return n.code === "NATIONAL_FALLBACK";
    })[0];
    if (fallbackNote) {
      els.banner.textContent = fallbackNote.message;
      els.banner.hidden = false;
    } else {
      els.banner.hidden = true;
    }

    // 1. Headline. Set statically first so the figure is correct even if the
    //    count-up never runs, then animate it at the tail of this function.
    els.headlineFigure.textContent = moneyRange(branch.cashUpFront);
    els.headlineRead.textContent = payload.headline;
    els.asOf.textContent =
      "Ranges based on publicly available " + result.asOfYear + " figures.";

    // 2. Three blocks
    renderCosts(branch);
    renderBack(branch);
    renderNet(branch);

    // Both branches
    if (result.branches) {
      var unknownNote = result.notes.filter(function (n) {
        return n.code === "SPECIAL_NEEDS_UNKNOWN";
      })[0];
      els.branchesLede.textContent = unknownNote ? unknownNote.message : "";
      var sameCost = renderFork(result.branches.specialNeedsYes, result.branches.specialNeedsNo);

      /* Name the stake up front. Most families do not realise this is one
         administrative determination, so state what it is worth in dollars. */
      var yes = result.branches.specialNeedsYes.netAfterCredits;
      var no = result.branches.specialNeedsNo.netAfterCredits;
      var swing = Math.max(Math.abs(no.low - yes.low), Math.abs(no.high - yes.high));
      /* When the cost is unchanged the determination is not irrelevant — every
         ongoing programme in the data is gated on it — so point at the section
         that does move rather than leaving "no difference" to stand alone. */
      var gatesSupport = sameCost && result.ongoing && result.ongoing.programs.length > 0;
      els.forkDelta.textContent = swing > 0
        ? "Worth up to " + money(swing) + " either way"
        : (gatesSupport
            ? "No difference in cost, but it decides the ongoing support below"
            : "No difference in cost on this path");
      els.branches.hidden = false;
    } else {
      els.branches.hidden = true;
    }

    // 3. Ongoing
    renderOngoing(result.ongoing);

    // 4. Timeline — the list, which is also the plate's fallback
    renderTimeline(result.timeline);

    // 5. The foster-care comparison, shown on every estimate: when the number is
    //    bad, the job of this page is to show the cheaper path.
    if (result.comparisonFosterCare) {
      var alt = result.comparisonFosterCare;
      els.abLabelA.textContent = payload.inputs.adoptionTypeLabel || "Your path";
      els.abFigureA.textContent = moneyRange(branch.cashUpFront);
      els.abFigureB.textContent = moneyRange(alt.cashUpFront);

      var mine = branch.cashUpFront.high;
      var theirs = alt.cashUpFront.high;
      if (theirs === 0 && mine > 0) {
        els.abRead.textContent =
          "At the top of each range, adopting from foster care in your state costs nothing up " +
          "front, against " + money(mine) + " on the path you chose.";
      } else if (theirs > 0 && mine > theirs * 1.2) {
        els.abRead.textContent =
          "At the top of each range, the path you chose costs about " +
          Math.round(mine / theirs) + " times what adopting from foster care would.";
      } else {
        els.abRead.textContent =
          "At the top of each range, these two paths cost about the same up front.";
      }
      els.compare.hidden = false;
    } else {
      els.compare.hidden = true;
    }

    // 5b. The tide plate. Derives from the same authoritative branch, and returns
    //     nothing at all rather than drawing a figure that could contradict the
    //     headline above.
    renderTide(result, branch);

    // 6. Notes
    renderNotes(result.notes);

    // 7. Math
    renderMath(branch);

    // 8. Disclaimer + actions
    els.disclaimer.textContent = result.disclaimer;
    hideMsg(els.saveMsg);

    els.results.hidden = false;

    /* Order matters, and none of this may be deferred to a rAF. While #fc-results
       is [hidden] the tide track has zero height, so tideRange would pin to 1 and
       the scrub would saturate on the first scroll pixel — the plate has to be
       measured after the unhide and BEFORE the smooth scroll, whose burst of
       scroll events would otherwise run against a stale offset. Reading
       offsetHeight forces the layout we need synchronously, which also keeps this
       correct in a backgrounded tab where rAF never runs at all. */
    mountTide();
    revealIn(els.results);
    countRange(els.headlineFigure, branch.cashUpFront);
    els.results.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "start"
    });
  }

  /* ------------------------------------------------------------- saved list */

  function renderSaved(rows) {
    clear(els.saved);
    if (!rows.length) {
      els.savedBlock.hidden = true;
      return;
    }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "fc-saved-item";

      var title = document.createElement("span");
      title.className = "fc-saved-title";
      var when = new Date(row.savedAt);
      title.textContent =
        "Version " + row.version + " · " + (row.inputs.adoptionTypeLabel || row.inputs.adoptionType) +
        " in " + row.inputs.state + ", saved " + when.toLocaleDateString();

      var figure = document.createElement("span");
      figure.className = "fc-saved-figure";
      figure.textContent = moneyRange(row.result.primary.cashUpFront) + " up front";

      var pdf = document.createElement("a");
      pdf.className = "fc-saved-pdf";
      pdf.href = "/api/calculator/results/" + encodeURIComponent(row.version) + "/pdf";
      pdf.textContent = "Download PDF";

      li.appendChild(title);
      li.appendChild(figure);
      li.appendChild(pdf);
      els.saved.appendChild(li);
    });
    els.savedBlock.hidden = false;
    revealIn(els.savedBlock);
  }

  async function loadSaved() {
    try {
      var res = await fetch("/api/calculator/results", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!res.ok) return;
      var data = await res.json();
      renderSaved(data.results || []);
    } catch (e) {
      /* the saved list is supplementary; never block the page on it */
    }
  }

  /* ------------------------------------------------------------------ events */

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideMsg(els.msg);

    var payload = readForm();
    if (!payload.state) {
      showMsg(els.msg, "error", "Choose the state you live in.");
      return;
    }

    setLoading(true);
    try {
      var out = await postJson("/api/calculator/estimate", payload);
      if (!out.ok) {
        showMsg(els.msg, "error",
          out.data.error || "Something went wrong running the estimate. Please try again.");
        return;
      }
      currentPayload = payload;
      render(out.data);
    } catch (e) {
      showMsg(els.msg, "error",
        "We could not reach the calculator. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  });

  els.save.addEventListener("click", async function () {
    if (!currentPayload) return;
    els.save.disabled = true;
    hideMsg(els.saveMsg);
    try {
      var out = await postJson("/api/calculator/save", currentPayload);
      if (!out.ok) {
        showMsg(els.saveMsg, "error", out.data.error || "Failed to save your estimate.");
        return;
      }
      /* The PDF lives on the saved row, not on a button up here: a download only
         exists once a version does, and every saved version keeps its own. */
      showMsg(els.saveMsg, "success",
        "Saved as version " + out.data.version + ". Download it from “Your saved " +
        "estimates” below. Re-running with different answers saves a new version " +
        "rather than replacing this one.");
      loadSaved();
    } catch (e) {
      showMsg(els.saveMsg, "error", "We could not save your estimate. Please try again.");
    } finally {
      els.save.disabled = false;
    }
  });

  /* -------------------------------------------------------------------- init */

  buildStates();
  prefillState();
  loadSaved();
})();
