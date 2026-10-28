/**
 * The Tide Plate — the calculator's signature graphic.
 *
 * Draws the family's cumulative cash position across the adoption journey as a
 * two-boundary uncertainty ribbon: path A is the low-cost world, path B is the
 * high-cost world, and the band between them is how much we genuinely do not know.
 *
 * THE INVARIANT THAT MATTERS
 * --------------------------
 * A chart that disagrees with the headline figure is worse than no chart. The
 * server's range arithmetic (src/calculator/calculate.ts) is NOT reproducible by
 * naively accumulating low and high costs:
 *
 *   - subtractRange() pairs CROSSED (low - high, high - low) and floors at zero,
 *     so the reimbursement step moves the two boundaries by different amounts and
 *     in ways plain accumulation gets backwards;
 *   - capRange() turns a single typed employer benefit into a RANGE.
 *
 * So this module accumulates only inside the money-out segment — where the server
 * itself is doing plain per-endpoint addition over the very array we receive, in
 * integer cents, making it exact — and reads every level after finalization
 * straight off the authoritative Branch. derive() then asserts that the
 * accumulated out-segment equals branch.gross bit-for-bit and returns null if it
 * does not, so the caller falls back to the plain list rather than drawing a lie.
 *
 * Exposed as window.HL_TIDE so the derivation can be exercised without a DOM.
 * Vanilla, no build step, to match the rest of public/.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ money */

  var NUM = typeof Intl !== "undefined" && Intl.NumberFormat
    ? new Intl.NumberFormat("en-US")
    : null;

  function money(cents) {
    var d = Math.round(cents / 100);
    return "$" + (NUM ? NUM.format(d) : String(d));
  }

  function moneyRange(r) {
    if (!r) return "—";
    return r.low === r.high ? money(r.low) : money(r.low) + " – " + money(r.high);
  }

  function addR(a, b) {
    return { low: a.low + b.low, high: a.high + b.high };
  }

  function eqR(a, b) {
    return a.low === b.low && a.high === b.high;
  }

  /* --------------------------------------------------- the phase partition */

  /**
   * Every line_item key the schema can produce, mapped onto one of the four
   * money-out phases. Sixteen keys: the eight standard ones from
   * src/data/calculator/README.md, the seven intercountry ones, and
   * program_fee_inclusive, which exists in cost_profiles.json but not in the
   * README's table.
   *
   * The partition must be exhaustive and disjoint — that is what makes the sum
   * of the four subtotals equal branch.gross exactly.
   */
  var PHASE_OF = {
    /* home_study: paying to be approved, before any child exists */
    home_study: "home_study",
    uscis_i800a: "home_study",
    uscis_biometrics: "home_study",

    /* agency_fees: the long middle — program fee, dossier, retainer. The server's
       own label for this event on the intercountry path reads "Program,
       immigration, and travel fees due", so I-800 belongs here. */
    agency_program_fee: "agency_fees",
    program_fee_inclusive: "agency_fees",
    document_authentication: "agency_fees",
    uscis_i800: "agency_fees",

    /* placement: a specific child is identified and comes home */
    travel: "placement",
    second_trip: "placement",
    in_country_fees: "placement",
    visa: "placement",
    icpc: "placement",
    birth_parent_expenses: "placement",
    post_placement_visits: "placement",

    /* finalization: the court date */
    court_filing: "finalization",
    attorney_fees: "finalization"
  };

  var OUT_PHASES = ["home_study", "agency_fees", "placement", "finalization"];

  /**
   * Assign a phase to every row. lineItems arrive in sort_order, which is a
   * chronology, so an unrecognized key inherits its nearest known predecessor
   * rather than being dumped in a constant bucket.
   */
  function phasesFor(rows) {
    var out = [];
    var carried = "agency_fees";
    for (var i = 0; i < rows.length; i++) {
      var known = PHASE_OF[rows[i].lineItem];
      if (known) carried = known;
      out.push(known || carried);
    }
    return out;
  }

  function sumPhase(rows, phases, phase) {
    var total = { low: 0, high: 0 };
    for (var i = 0; i < rows.length; i++) {
      if (phases[i] !== phase) continue;
      total.low += rows[i].low;
      total.high += rows[i].high;
    }
    return total;
  }

  function rowsIn(rows, phases, phase) {
    var out = [];
    for (var i = 0; i < rows.length; i++) if (phases[i] === phase) out.push(rows[i]);
    return out;
  }

  /* ------------------------------------------------------------ zero events */

  /**
   * Why a stage costs nothing. Three cases, all sourced from the data, none
   * invented — and detected off lineItem keys, never by sniffing label text.
   */
  function zeroReason(phaseRows, allRows) {
    if (phaseRows.length > 0) {
      /* Genuinely $0 with a real source: quote the row's own label. Seeded labels
         are written as "<what it is>: <why it is free>", and only the second half
         is news here, so prefer it. The whole sentence still reaches the reader
         through the group's <title> and the list fallback. */
      var label = phaseRows[0].label;
      var colon = label.indexOf(": ");
      var reason = colon !== -1 ? label.slice(colon + 2).trim() : label;
      return { kind: "free", text: reason, full: label };
    }
    for (var i = 0; i < allRows.length; i++) {
      var k = allRows[i].lineItem;
      if ((k === "agency_program_fee" || k === "program_fee_inclusive") && allRows[i].high > 0) {
        return { kind: "included", text: "Included in the program fee" };
      }
    }
    return { kind: "none", text: "No separate fee on this path" };
  }

  /* Short labels: the server's are full sentences, far too long for a tick. The
     full text still reaches the user via <title> and the list fallback. */
  var SHORT_LABEL = {
    home_study: "Home study",
    agency_fees: "Agency & legal",
    placement: "Placement",
    finalization: "Finalization",
    reimbursement: "Reimbursed",
    tax_credit: "Tax credit",
    subsidy_start: "Subsidy begins"
  };

  /**
   * Per-event magnitudes are DIFFERENCES OF LEVELS, which makes them a pair of
   * deltas rather than a Range. At the reimbursement step the crossed pairing
   * drives the two apart — commonly "$2,000 back in the low-cost world, nothing
   * in the high-cost world" — so this must never render as "$0 - $2,000".
   */
  /**
   * SVG <text> does not wrap, and an event tick is only about 130 user units
   * wide — roughly 22 characters at the amount size. Break on words into at most
   * two lines and ellipsize beyond that; the untruncated text is always available
   * from the group's <title> and from the list fallback beneath the plate.
   */
  function wrapLines(str, maxChars, maxLines) {
    var words = String(str).split(/\s+/);
    var lines = [];
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + " " + words[i] : words[i];
      if (next.length <= maxChars || !line) {
        line = next;
      } else {
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) break;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines) {
      /* Did anything not fit? */
      var joined = lines.join(" ");
      if (joined.length < String(str).replace(/\s+/g, " ").length) {
        var last = lines[maxLines - 1];
        lines[maxLines - 1] = last.slice(0, Math.max(0, maxChars - 1)).replace(/\s+$/, "") + "…";
      }
    }
    return lines;
  }

  function amountLines(deltaLow, deltaHigh, direction, zero) {
    var a = Math.abs(deltaLow);
    var b = Math.abs(deltaHigh);
    var lo = Math.min(a, b);
    var hi = Math.max(a, b);

    if (hi === 0) return zero ? wrapLines(zero.text, 20, 2) : ["No money moves"];

    if (direction === "back") {
      if (lo === hi) return [money(hi) + " back"];
      if (lo === 0) return ["up to " + money(hi) + " back", "or nothing"];
      return [money(lo) + " – " + money(hi), "back"];
    }
    if (lo === hi) return [money(hi) + " out"];
    return [money(lo) + " – " + money(hi), "out"];
  }

  /* --------------------------------------------------------------- derive() */

  /**
   * Build the plate model from an authoritative CalcResult + Branch.
   * Returns null when the reconciliation invariant fails — the caller then shows
   * the plain list instead. Pure: no DOM, no globals, safe to unit test.
   */
  function derive(result, branch) {
    if (!result || !branch || !result.timeline || !result.timeline.length) return null;

    var rows = branch.lineItems || [];
    var phases = phasesFor(rows);

    /* Cumulative OUTLAY per scenario, in cents — "how far down you are".
       Money out raises it; money back lowers it. */
    var L = {};
    L.home_study = sumPhase(rows, phases, "home_study");
    L.agency_fees = addR(L.home_study, sumPhase(rows, phases, "agency_fees"));
    L.placement = addR(L.agency_fees, sumPhase(rows, phases, "placement"));

    /* THE GUARD. If our partition of the line items does not reproduce the
       server's own gross exactly, we have no business drawing anything. */
    var accumulated = addR(L.placement, sumPhase(rows, phases, "finalization"));
    if (!eqR(accumulated, branch.gross)) return null;

    L.finalization = branch.gross;            /* authoritative */
    L.reimbursement = branch.cashUpFront;     /* authoritative — the headline figure */
    L.tax_credit = branch.netAfterCredits;    /* authoritative */
    L.subsidy_start = branch.netAfterCredits; /* a rate, not an amount: no step */

    var employer = branch.employerBenefitApplied || { low: 0, high: 0 };
    var hasEmployer = employer.high > 0 || employer.low > 0;
    var ongoing = result.ongoing || {};

    var events = [];
    var prev = { low: 0, high: 0 };

    for (var i = 0; i < result.timeline.length; i++) {
      var t = result.timeline[i];
      var level = L[t.key];
      if (!level) continue; /* unknown timeline key: skip rather than guess */

      var dLow = level.low - prev.low;
      var dHigh = level.high - prev.high;
      var isZero = dLow === 0 && dHigh === 0;

      var zero = null;
      if (isZero && OUT_PHASES.indexOf(t.key) !== -1) {
        zero = zeroReason(rowsIn(rows, phases, t.key), rows);
      } else if (isZero && t.key === "reimbursement") {
        /* A program can exist and still move nothing: the crossed subtraction
           floors at zero, so a $1,000 reimbursement against a $395 cost changes
           neither boundary. Saying "nothing comes back" there would be wrong. */
        var anyProgram = (branch.reimbursementPrograms || []).length > 0 || employer.high > 0;
        zero = {
          kind: "none",
          text: anyProgram
            ? "No change to what you need up front"
            : "Nothing comes back here"
        };
      } else if (isZero && t.key === "tax_credit") {
        zero = { kind: "none", text: "No credit at this income" };
      } else if (isZero && t.key === "subsidy_start") {
        /* Not a step: a monthly rate, which is never netted against cost. */
        zero = {
          kind: "none",
          text: ongoing.monthlySubsidy
            ? money(ongoing.monthlySubsidy.high) + "/mo from here"
            : (ongoing.monthlySubsidyName ? "Negotiated per child" : "No monthly subsidy")
        };
      } else if (isZero) {
        zero = { kind: "none", text: "No amount set in advance" };
      }

      var short = SHORT_LABEL[t.key] || t.label;
      /* Both offsets land at this step, and "Employer + reimbursed" is wider than
         a tick. The plural covers both honestly; the breakdown is in the rows
         above and in the list beneath the plate. */
      if (t.key === "reimbursement" && hasEmployer) short = "Reimbursements";

      events.push({
        key: t.key,
        label: t.label,
        short: short,
        when: t.when,
        direction: t.direction,
        level: level,
        deltaLow: dLow,
        deltaHigh: dHigh,
        zero: zero,
        lines: amountLines(dLow, dHigh, t.direction, zero)
      });

      prev = level;
    }

    if (!events.length) return null;

    var depth = 0;
    for (var j = 0; j < events.length; j++) {
      depth = Math.max(depth, events[j].level.low, events[j].level.high);
    }
    if (depth <= 0) depth = 1; /* an all-zero path still needs a scale */

    return {
      events: events,
      trough: branch.gross,
      plateau: branch.cashUpFront,
      net: branch.netAfterCredits,
      depth: depth,
      gapFrom: indexOfKey(events, "finalization"),
      gapTo: indexOfKey(events, "tax_credit"),
      troughAt: indexOfKey(events, "finalization"),
      plateauAt: indexOfKey(events, "reimbursement"),
      tail: {
        monthly: ongoing.monthlySubsidy || null,
        name: ongoing.monthlySubsidyName || null,
        detail: ongoing.monthlySubsidyDetail || null,
        present: indexOfKey(events, "subsidy_start") !== -1
      }
    };
  }

  function indexOfKey(events, key) {
    for (var i = 0; i < events.length; i++) if (events[i].key === key) return i;
    return -1;
  }

  /* ---------------------------------------------------------------- geometry */

  function fmt(n) {
    return (Math.round(n * 100) / 100).toString();
  }

  function dist(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function toward(from, to, d) {
    var len = dist(from, to);
    if (len === 0) return { x: from.x, y: from.y };
    var t = d / len;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  /**
   * A polyline with softened corners. The ribbon is stepped, never splined —
   * money moves in discrete events and a smooth curve would be a lie — but a
   * hard right angle reads as a spreadsheet, so each corner gets a small arc.
   */
  function roundedPolyline(pts, r) {
    if (!pts.length) return "";
    if (pts.length === 1) return "M " + fmt(pts[0].x) + " " + fmt(pts[0].y);

    var d = "M " + fmt(pts[0].x) + " " + fmt(pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i], a = pts[i - 1], b = pts[i + 1];
      var rr = Math.min(r, dist(a, p) / 2, dist(p, b) / 2);
      if (rr < 0.5) {
        d += " L " + fmt(p.x) + " " + fmt(p.y);
        continue;
      }
      var p1 = toward(p, a, rr);
      var p2 = toward(p, b, rr);
      d += " L " + fmt(p1.x) + " " + fmt(p1.y);
      d += " Q " + fmt(p.x) + " " + fmt(p.y) + " " + fmt(p2.x) + " " + fmt(p2.y);
    }
    var last = pts[pts.length - 1];
    return d + " L " + fmt(last.x) + " " + fmt(last.y);
  }

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
    }
    return node;
  }

  function text(str, attrs) {
    var node = el("text", attrs);
    node.textContent = str;
    return node;
  }

  /* ------------------------------------------------------------------ layout */

  /**
   * Per-band POLICY only — the geometry itself is measured from the mount.
   *
   * This used to be three fixed viewBoxes (1240x660 and friends) drawn with
   * preserveAspectRatio="meet" into a box the stylesheet clamped with
   * max-height. Whenever the clamp bit — which was every desktop viewport
   * shorter than about 1190px, i.e. essentially all of them — the whole drawing
   * scaled down by roughly a quarter and sat letterboxed with ~73px of dead
   * space at each end, taking the type with it: a 12.5-unit label painted at
   * 8.5px. Measuring the box instead makes one user unit one CSS pixel, so a
   * font-size of 12.5 IS 12.5px and the plate fills its frame exactly.
   *
   * The band still arrives resolved from matchMedia, so the decision about
   * whether per-event labels have room can never disagree with the stylesheet.
   */
  var VIEWS = {
    wide:   { labels: true,  font: 1,    padX: 88, readout: true,  minH: 340 },
    mid:    { labels: true,  font: 1.05, padX: 56, readout: false, minH: 300 },
    narrow: { labels: false, font: 1.15, padX: 28, readout: false, minH: 200 }
  };

  function viewFor(band) {
    if (typeof band === "string") return VIEWS[band] || VIEWS.wide;
    if (band >= 901) return VIEWS.wide;
    if (band >= 601) return VIEWS.mid;
    return VIEWS.narrow;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var COUNT_WORD = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven" };

  var OUT_KEY = { home_study: 1, agency_fees: 1, placement: 1, finalization: 1 };

  function isZeroCost(e) {
    return e.deltaLow === 0 && e.deltaHigh === 0 && OUT_KEY[e.key] === 1;
  }

  /**
   * Maximal runs of two or more adjacent cost stages where nothing moved.
   *
   * Grouping happens HERE and never in derive(): tidePlate.test.ts asserts that
   * events and timeline entries are one-to-one, and the reconciliation invariant
   * has to stay exactly where it is. This is presentation.
   *
   * Florida's foster-care profile is three such stages in a row. Given a full
   * three-line label stack each, they filled the left half of the plate with
   * three restatements of "this costs nothing" and left the chart reading as
   * mostly empty. One bracket says it once.
   */
  function zeroRuns(events) {
    var runs = [], i = 0;
    while (i < events.length) {
      if (!isZeroCost(events[i])) { i++; continue; }
      var j = i;
      while (j + 1 < events.length && isZeroCost(events[j + 1])) j++;
      if (j > i) runs.push({ from: i, to: j });
      i = j + 1;
    }
    return runs;
  }

  /* ---------------------------------------------------------------- render() */

  /**
   * Build the plate's SVG. Returns a small controller the page uses to scrub it;
   * the caller owns the pin and the scroll maths.
   */
  function render(mount, plate, band) {
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    var V = viewFor(band);
    var n = plate.events.length;

    /* --- measure the frame we were handed ----------------------------------- */
    var box = mount.getBoundingClientRect();
    var W = Math.max(Math.round(box.width) || 0, 320);
    var measured = Math.round(box.height) || 0;
    /* A mount can be measured before the stylesheet has given it a height — the
       caller retries in that case, but never draw from a collapsed box. */
    /* A measured box is authoritative — the stylesheet already bounds it. Only
       the fallback shape needs an upper clamp, and applying that clamp to the
       measured value letterboxed the plate by 127px on a phone. */
    var H = measured > 40
      ? Math.max(measured, V.minH)
      : clamp(Math.round(W * (V.labels ? 0.58 : 0.78)), V.minH, Math.round(W * 1.05));

    var padX = Math.min(V.padX, Math.round(W * 0.1));
    var plotX = padX;
    var plotW = W - padX * 2;
    var endX = W - padX;
    /* Leave the last slot for the tail so the subsidy ramp has somewhere to run. */
    var seg = plotW / (n + 1);

    /* Below this the ticks sit closer together than one word is wide, and no
       wrap width saves it — adjacent stacks simply overprint. Fall back to the
       shape-only view, which the caller already answers by opening the list
       beneath the plate. V is copied because VIEWS is shared between renders. */
    if (V.labels && seg < 88) {
      V = { labels: false, font: V.font, padX: V.padX, readout: V.readout, minH: V.minH };
    }

    /* A label is only as wide as its tick, so the wrap width is derived from the
       real tick pitch rather than being a constant a wider plate would waste and
       a narrower one would overrun. */
    var labelChars = Math.max(9, Math.floor(seg / (7.4 * V.font)));
    var whenChars = Math.max(10, Math.floor(seg / (6.2 * V.font)));
    var amtChars = Math.max(10, Math.floor(seg / (6.6 * V.font)));

    var runs = V.labels ? zeroRuns(plate.events) : [];
    var grouped = {};
    runs.forEach(function (r) {
      for (var gi = r.from; gi <= r.to; gi++) grouped[gi] = r;
    });

    /* --- the vertical lane budget -------------------------------------------
       Every annotation owns a lane, so two of them cannot land on the same
       pixels. They used to: the gap bracket's note was drawn SIX PIXELS below
       the y the event labels started at, so "12 to 18 months out, nothing back
       yet" printed straight through "Finalization / 6-12 months after
       placement". Solving for the plot depth last makes that impossible. */
    var hasGap = plate.gapFrom >= 0 && plate.gapTo > plate.gapFrom;
    var headLane = V.readout ? 62 : 26;   /* the readout and the zero-line label */
    var gapLane = hasGap ? Math.round(60 * V.font) : 8;
    var footLane = 10;

    /* Wrap once, here, and reuse below: the line counts decide the lane, and
       wrapping again in the draw loop could disagree with what we budgeted. */
    var wrapped = [];
    for (var w0 = 0; w0 < n; w0++) {
      var e0 = plate.events[w0];
      wrapped.push({
        name: wrapLines(e0.short, labelChars, 2),
        when: wrapLines(String(e0.when).split(",")[0], whenChars, 2),
        /* derive() wraps these at a fixed 20 characters, which is wider than a
           tick on any plate under ~1300px. Re-flow for display only — the text
           is untouched, and <title> still carries the whole sentence. */
        amt: wrapLines(e0.lines.join(" "), amtChars, 2)
      });
    }

    var labelLane = 0;
    if (V.labels) {
      var tallest = 0;
      for (var q = 0; q < n; q++) {
        if (grouped[q]) continue;
        tallest = Math.max(tallest,
          wrapped[q].name.length * 19 * V.font +
          wrapped[q].when.length * 15 * V.font +
          wrapped[q].amt.length * 16 * V.font + 6 * V.font);
      }
      /* A collapsed run draws a bracket plus two short lines of its own. */
      if (runs.length) tallest = Math.max(tallest, 58 * V.font);
      labelLane = clamp(tallest + 16, 84, Math.round(H * 0.38));
    }

    var depth = H - headLane - gapLane - labelLane - footLane;
    /* The ribbon never starves: if the type wants more room than the frame has,
       the label lane gives it back rather than the plot collapsing. */
    if (depth < 130) {
      labelLane = Math.max(0, labelLane - (130 - depth));
      depth = H - headLane - gapLane - labelLane - footLane;
    }
    depth = Math.max(depth, 90);

    var zeroY = headLane;
    var floorY = zeroY + depth;
    var labelY = floorY + gapLane + 16;

    function yFor(cents) { return zeroY + (cents / plate.depth) * depth; }
    function xFor(i) { return plotX + (i + 1) * seg; }

    var svg = el("svg", {
      viewBox: "0 0 " + W + " " + H,
      /* With the viewBox equal to the box this is a no-op — which is the point.
         Kept rather than "none" so a sub-pixel mismatch scales uniformly instead
         of shearing the glyphs. */
      preserveAspectRatio: "xMidYMid meet",
      role: "presentation",
      focusable: "false"
    });

    /* --- defs: the ribbon gradient and the scroll wipe ---------------------- */
    var defs = el("defs");
    var grad = el("linearGradient", {
      id: "fcTideFill", x1: "0", y1: "0", x2: "0", y2: "1"
    });
    var s1 = el("stop", { offset: "0" });
    s1.setAttribute("class", "fc-tide-stop-a");
    var s2 = el("stop", { offset: "1" });
    s2.setAttribute("class", "fc-tide-stop-b");
    grad.appendChild(s1);
    grad.appendChild(s2);
    defs.appendChild(grad);

    var clip = el("clipPath", { id: "fcTideWipe", clipPathUnits: "userSpaceOnUse" });
    var wipeRect = el("rect", { x: 0, y: 0, width: W, height: H });
    clip.appendChild(wipeRect);
    defs.appendChild(clip);
    svg.appendChild(defs);

    /* --- the zero line, left half of the plate's header --------------------- */
    var base = el("g");
    base.setAttribute("class", "fc-tide-base");
    base.appendChild(el("line", {
      x1: plotX - 26, y1: zeroY, x2: endX + 26, y2: zeroY,
      "vector-effect": "non-scaling-stroke"
    }));
    base.appendChild(text("$0 · WHERE YOU STAND TODAY", {
      x: plotX - 26, y: zeroY - 12, "class": "fc-tide-zero-label",
      "font-size": 12 * V.font
    }));
    svg.appendChild(base);

    /* --- guide levels: the trough and the plateau --------------------------- */
    var guides = el("g");
    guides.setAttribute("class", "fc-tide-guides");
    function guide(cents, label, peak) {
      var y = yFor(cents);
      guides.appendChild(el("line", {
        x1: plotX, y1: y, x2: endX, y2: y,
        "vector-effect": "non-scaling-stroke"
      }));
      guides.appendChild(text(label, {
        x: endX, y: y - 9, "text-anchor": "end",
        /* The peak label IS the y axis. Without it a $395 filing fee drawn at
           full plot depth reads exactly like a $40,000 one, which is the
           misleading choice — so it gets the emphasis. */
        "class": "fc-tide-guide-label" + (peak ? " fc-tide-guide-label--peak" : ""),
        "font-size": (peak ? 12.5 : 11.5) * V.font
      }));
    }
    /* A guide that lands on the zero rule is the zero rule, and its label lands
       in the readout's lane — "AFTER REIMBURSEMENT $0" printing straight through
       the live figure. Nothing is lost by not drawing a line already there. */
    function guideVisible(cents) { return yFor(cents) - zeroY > 6; }

    if (guideVisible(plate.trough.high)) {
      guide(plate.trough.high, "PEAK OUTLAY " + moneyRange(plate.trough), true);
    }
    if (guideVisible(plate.plateau.high) &&
        (plate.plateau.high !== plate.trough.high || plate.plateau.low !== plate.trough.low)) {
      guide(plate.plateau.high, "AFTER REIMBURSEMENT " + moneyRange(plate.plateau), false);
    }
    svg.appendChild(guides);

    /* --- the ribbon --------------------------------------------------------- */
    var ptsA = [{ x: plotX, y: zeroY }];  /* low-cost world */
    var ptsB = [{ x: plotX, y: zeroY }];  /* high-cost world */
    var prevA = 0, prevB = 0;
    var lowFlat = true;

    for (var i = 0; i < n; i++) {
      var ev = plate.events[i];
      var x = xFor(i);
      if (ev.level.low !== 0) lowFlat = false;
      ptsA.push({ x: x, y: yFor(prevA) });
      ptsA.push({ x: x, y: yFor(ev.level.low) });
      ptsB.push({ x: x, y: yFor(prevB) });
      ptsB.push({ x: x, y: yFor(ev.level.high) });
      prevA = ev.level.low;
      prevB = ev.level.high;
    }
    /* run both boundaries out to the right edge */
    ptsA.push({ x: endX, y: yFor(prevA) });
    ptsB.push({ x: endX, y: yFor(prevB) });

    var R = Math.min(7, seg / 3);
    var dA = roundedPolyline(ptsA, R);
    var dB = roundedPolyline(ptsB, R);
    var dBRev = roundedPolyline(ptsB.slice().reverse(), R);

    var wiped = el("g", { "clip-path": "url(#fcTideWipe)" });

    /* Drawn as two SCENARIOS filled between, not as a sorted interval: a fill
       between two paths stays well defined even if they cross, which
       netAfterCredits can once a state flat_max credit is seeded. */
    var fill = el("path", {
      d: dA + " L" + dBRev.slice(1) + " Z",
      fill: "url(#fcTideFill)",
      "fill-rule": "nonzero"
    });
    fill.setAttribute("class", "fc-tide-fill");
    wiped.appendChild(fill);

    var pathB = el("path", { d: dB, "vector-effect": "non-scaling-stroke" });
    pathB.setAttribute("class", "fc-tide-edge fc-tide-edge--high");
    wiped.appendChild(pathB);

    var pathA = el("path", { d: dA, "vector-effect": "non-scaling-stroke" });
    /* When every low level is $0 this edge lies exactly on the zero rule and
       vanishes into it — which is why a real $0–$395 band read as a bare
       rectangle. Dashed and named, it reads as the boundary it is. */
    pathA.setAttribute("class", "fc-tide-edge fc-tide-edge--low" + (lowFlat ? " is-flat" : ""));
    wiped.appendChild(pathA);

    /* Shape-only mode carries no prose — and at that width this note and the
       tail label meet in the middle. The list beneath says it in words. */
    if (lowFlat && V.labels) {
      /* Left rail: the right one belongs to the guide labels and the tail. */
      wiped.appendChild(text("IF EVERYTHING GOES THE CHEAP WAY: $0 THROUGHOUT", {
        x: plotX, y: zeroY + 19, "class": "fc-tide-guide-label",
        "font-size": 11 * V.font
      }));
    }

    /* --- the subsidy tail ---------------------------------------------------
       For a Florida foster-care family this is the whole story — almost nothing
       goes out, and $417 a month comes back for years. Its label is kept clear
       of the right-hand guide lane rather than sharing an anchor with it, which
       is what used to overprint the two. */
    if (plate.tail.present) {
      var tailY = yFor(prevB);
      var hasSlope = plate.tail.monthly && plate.tail.monthly.high > 0;
      var tailEndX = W - 6;
      /* The ramp stops just short of the zero rule rather than climbing above
         it: above the rule is the head lane, and a tail label up there printed
         straight through the docked readout. */
      var tailEndY = hasSlope ? Math.max(zeroY + 10, tailY - depth * 0.55) : tailY;
      var tail = el("path", {
        d: "M " + fmt(endX - seg) + " " + fmt(tailY) + " L " + fmt(tailEndX) + " " + fmt(tailEndY),
        "vector-effect": "non-scaling-stroke"
      });
      tail.setAttribute("class", "fc-tide-tail" + (hasSlope ? "" : " fc-tide-tail--flat"));
      wiped.appendChild(tail);

      wiped.appendChild(text(
        hasSlope ? "+" + money(plate.tail.monthly.high) + "/mo, continuing"
                 : "Subsidy negotiated per child",
        {
          x: tailEndX,
          y: tailEndY + 20,
          "text-anchor": "end",
          "class": "fc-tide-tail-label",
          "font-size": 14 * V.font
        }
      ));
    }

    /* --- the gap bracket, in a lane of its own ------------------------------ */
    if (hasGap) {
      var gx1 = xFor(plate.gapFrom);
      var gx2 = xFor(plate.gapTo);
      /* All of this lane's type hangs BELOW its rule. Above it is the plot
         floor and the peak-outlay guide, and "THE GAP" set above the line had
         the guide running straight through its ascenders. */
      var gy = floorY + Math.round(14 * V.font);
      var g = el("g");
      g.setAttribute("class", "fc-tide-gap");
      /* An engraver's dimension line: a solid rule with serifed end ticks. */
      g.appendChild(el("path", {
        d: "M " + fmt(gx1) + " " + fmt(gy - 6) + " L " + fmt(gx1) + " " + fmt(gy + 6) +
           " M " + fmt(gx1) + " " + fmt(gy) + " L " + fmt(gx2) + " " + fmt(gy) +
           " M " + fmt(gx2) + " " + fmt(gy - 6) + " L " + fmt(gx2) + " " + fmt(gy + 6),
        "vector-effect": "non-scaling-stroke"
      }));
      g.appendChild(text("THE GAP", {
        x: (gx1 + gx2) / 2, y: gy + 19 * V.font, "text-anchor": "middle",
        "class": "fc-tide-gap-title", "font-size": 12 * V.font
      }));
      g.appendChild(text("12 to 18 months out, nothing back yet", {
        x: (gx1 + gx2) / 2, y: gy + 35 * V.font, "text-anchor": "middle",
        "class": "fc-tide-gap-note", "font-size": 12 * V.font
      }));
      wiped.appendChild(g);
    }

    /* --- events: stem, node, labels ---------------------------------------- */
    var evGroups = [];
    for (var k = 0; k < n; k++) {
      var e = plate.events[k];
      var ex = xFor(k);
      var ey = yFor(e.level.high);
      var isZero = e.deltaLow === 0 && e.deltaHigh === 0;
      var run = grouped[k];

      var gg = el("g", { "data-passed": "0", "data-amount": isZero ? "zero" : "moved" });
      gg.setAttribute("class", "fc-tide-ev fc-tide-ev--" + e.direction);

      var title = el("title");
      /* The tick labels are truncated to fit; this carries the whole sentence, so
         hover and assistive tech get the sourced text rather than the ellipsis.
         A collapsed run still gets one <title> per member for the same reason. */
      title.textContent = e.label + " · " + e.when +
        (e.zero && e.zero.full ? " (" + e.zero.full + ")" : "");
      gg.appendChild(title);

      gg.appendChild(el("line", {
        x1: ex, y1: zeroY, x2: ex, y2: ey,
        "vector-effect": "non-scaling-stroke"
      }));

      var node = el("circle", { cx: ex, cy: ey, r: isZero ? 4.5 : 3.5 });
      node.setAttribute("class", "fc-tide-node");
      gg.appendChild(node);

      /* A stage that costs nothing puts its node ON the zero rule while its
         label sits in the lane at the bottom of the plate — several hundred
         pixels of empty ground between a tick and the words describing it, with
         nothing saying they belong together. A dashed leader closes that. */
      if (V.labels) {
        var leadTo = (run ? labelY - 20 : labelY) - 12;
        if (leadTo - ey > 40) {
          var lead = el("line", {
            x1: ex, y1: ey + 7, x2: ex, y2: leadTo,
            "vector-effect": "non-scaling-stroke"
          });
          lead.setAttribute("class", "fc-tide-leader");
          gg.appendChild(lead);
        }
      }

      /* An "included elsewhere" stage gets a tie up to the agency step: this cost
         is real, it just lives over there. Without it the single-line-item
         profiles — which are the most common render — look empty. */
      if (isZero && e.zero && e.zero.kind === "included" && plate.events[1]) {
        var tieX = xFor(1);
        var tie = el("path", {
          d: "M " + fmt(ex) + " " + fmt(ey) + " L " + fmt((ex + tieX) / 2) + " " + fmt(ey) +
             " L " + fmt(tieX) + " " + fmt(yFor(plate.events[1].level.high)),
          "vector-effect": "non-scaling-stroke"
        });
        tie.setAttribute("class", "fc-tide-tie");
        gg.appendChild(tie);
      }

      if (V.labels && run && run.to === k) {
        /* One bracket for the whole run, hung off its LAST member so it arrives
           with the scrub at the moment the run is complete. Every member keeps
           its own ring and stem: each is still a real moment in the process. */
        var bx1 = xFor(run.from);
        var bx2 = xFor(run.to);
        var by = labelY - 14;
        var brace = el("path", {
          d: "M " + fmt(bx1) + " " + fmt(by - 7) + " L " + fmt(bx1) + " " + fmt(by) +
             " L " + fmt(bx2) + " " + fmt(by) + " L " + fmt(bx2) + " " + fmt(by - 7),
          "vector-effect": "non-scaling-stroke"
        });
        brace.setAttribute("class", "fc-tide-zero-brace");
        gg.appendChild(brace);

        var names = [];
        for (var ni = run.from; ni <= run.to; ni++) names.push(plate.events[ni].short);
        var bMid = (bx1 + bx2) / 2;
        var bChars = Math.max(16, Math.floor((bx2 - bx1) / (6.9 * V.font)));
        var bly = labelY + 6;
        wrapLines(names.join(" · "), bChars, 2).forEach(function (line) {
          gg.appendChild(text(line, {
            x: bMid, y: bly, "text-anchor": "middle",
            "class": "fc-tide-ev-label", "font-size": 14 * V.font
          }));
          bly += 18 * V.font;
        });
        var count = run.to - run.from + 1;
        gg.appendChild(text(
          "Nothing to pay at these " + (COUNT_WORD[count] || count) + " stages",
          {
            x: bMid, y: bly + 5, "text-anchor": "middle",
            "class": "fc-tide-ev-amt", "font-size": 12.5 * V.font
          }
        ));
      } else if (V.labels && !run) {
        var anchor = k === 0 ? "start" : (k === n - 1 ? "end" : "middle");
        var lx = ex;
        if (anchor === "start") lx = ex - seg * 0.42;
        if (anchor === "end") lx = ex + seg * 0.42;

        /* One running cursor rather than fixed offsets: the timing prose and the
           amount both wrap to a variable number of lines, and hard-coded y values
           would collide the moment either needed two. */
        var ly = labelY;
        wrapped[k].name.forEach(function (line) {
          gg.appendChild(text(line, {
            x: lx, y: ly, "text-anchor": anchor,
            "class": "fc-tide-ev-label", "font-size": 14 * V.font
          }));
          ly += 19 * V.font;
        });

        /* The server's `when` is prose, and its longest form is "Early 2027, for
           an adoption finalized in 2026" — three times the width of a tick. The
           clause before the comma is the part that answers "when", so take it and
           leave the rest to <title> and the list. */
        wrapped[k].when.forEach(function (line) {
          gg.appendChild(text(line, {
            x: lx, y: ly, "text-anchor": anchor,
            "class": "fc-tide-ev-when", "font-size": 12 * V.font
          }));
          ly += 15 * V.font;
        });
        ly += 6 * V.font;

        for (var m = 0; m < wrapped[k].amt.length; m++) {
          gg.appendChild(text(wrapped[k].amt[m], {
            x: lx, y: ly, "text-anchor": anchor,
            "class": "fc-tide-ev-amt", "font-size": 12.5 * V.font
          }));
          ly += 16 * V.font;
        }
      }

      wiped.appendChild(gg);
      evGroups.push(gg);
    }

    /* --- the plumb line on the headline figure ------------------------------ */
    var anchorIdx = plate.plateauAt >= 0 ? plate.plateauAt : plate.troughAt;
    if (anchorIdx >= 0) {
      var px = xFor(anchorIdx);
      var plumb = el("g");
      plumb.setAttribute("class", "fc-tide-plumb");
      plumb.appendChild(el("line", {
        x1: px, y1: zeroY - 4, x2: px, y2: floorY + gapLane,
        "vector-effect": "non-scaling-stroke"
      }));
      wiped.appendChild(plumb);
    }

    svg.appendChild(wiped);

    /* --- the travelling head and the docked readout (desktop scrub only) -----
       The head line travels; the figure does not. It used to be translated to
       clamp(x + 108, ...) on every frame, which left "OUT OF POCKET, SO FAR /
       $0" drifting around the top of the plate attached to nothing. Docked at
       the right-hand plot edge it becomes the other half of the plate's header,
       opposite the zero-line datum — and both of its edges are pinned, so digits
       changing width cannot make it twitch. */
    var head = el("g");
    head.setAttribute("class", "fc-tide-head");
    var headLine = el("line", {
      x1: plotX, y1: zeroY - (V.readout ? 24 : 8), x2: plotX, y2: floorY + gapLane,
      "vector-effect": "non-scaling-stroke"
    });
    head.appendChild(headLine);
    svg.appendChild(head);

    var readout = null, rFig = null;
    if (V.readout) {
      readout = el("g");
      readout.setAttribute("class", "fc-tide-readout");
      readout.appendChild(text("OUT OF POCKET, SO FAR", {
        x: endX, y: zeroY - 42, "text-anchor": "end",
        "class": "fc-tide-readout-label", "font-size": 11 * V.font
      }));
      rFig = text("", {
        x: endX, y: zeroY - 14, "text-anchor": "end",
        "class": "fc-tide-readout-fig", "font-size": 25 * V.font
      });
      readout.appendChild(rFig);
      svg.appendChild(readout);
    }

    mount.appendChild(svg);

    /* --- the controller ----------------------------------------------------- */
    var lastFig = "", lastIdx = -1;

    function levelAt(p) {
      var x = plotX + p * plotW;
      var lvl = { low: 0, high: 0 };
      for (var i = 0; i < n; i++) {
        if (xFor(i) <= x) lvl = plate.events[i].level;
        else break;
      }
      return lvl;
    }

    function paint(p) {
      var x = plotX + p * plotW;
      /* The tail and its label live in the margin past the last tick, so the
         wipe has to reach the full width by the end of the scrub — stopping at
         endX + half a segment sheared "+$417/mo, continuing" in half. */
      wipeRect.setAttribute("width", fmt(Math.min(W, x + seg * 0.5 + padX * p)));
      headLine.setAttribute("x1", fmt(x));
      headLine.setAttribute("x2", fmt(x));

      var lvl = levelAt(p);
      var a = money(Math.min(lvl.low, lvl.high));
      var b = money(Math.max(lvl.low, lvl.high));
      /* A point value renders as one figure rather than the same number twice. */
      var figure = a === b ? b : a + " – " + b;
      if (rFig && figure !== lastFig) { lastFig = figure; rFig.textContent = figure; }

      var idx = -1;
      for (var i = 0; i < n; i++) if (xFor(i) <= x + seg * 0.5) idx = i;
      if (idx !== lastIdx) {
        lastIdx = idx;
        for (var j = 0; j < evGroups.length; j++) {
          evGroups[j].setAttribute("data-passed", j <= idx ? "1" : "0");
        }
      }
    }

    paint(1);

    return { paint: paint, view: V, svg: svg, width: W, height: H };
  }

  root.HL_TIDE = {
    derive: derive,
    render: render,
    money: money,
    moneyRange: moneyRange,
    /* exported for tests */
    _phasesFor: phasesFor,
    _PHASE_OF: PHASE_OF
  };
})(typeof window !== "undefined" ? window : this);
