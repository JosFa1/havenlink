/* HavenLink partner page behavior: the agency/organization form variant
   switch and the stitched-seam progress indicator. Shared behavior (nav
   state, reveals) lives in editorial.js. script.js owns the actual form
   submission - this file never touches the submit flow. */
(function () {
  "use strict";

  var form = document.getElementById("partnershipForm");
  if (!form) return;

  /* ---------- Variant switch ---------- */

  var radios = form.querySelectorAll('input[name="partner_type"]');
  var agencyOnly = form.querySelectorAll(".pt-agency-only");
  var orgOnly = form.querySelectorAll(".pt-org-only");
  var cards = form.querySelectorAll(".pt-switch-card");

  function currentVariant() {
    var checked = form.querySelector('input[name="partner_type"]:checked');
    return checked && checked.value === "organization" ? "organization" : "agency";
  }

  /* Visibility (CSS keys off data-variant) and exclusion (fieldset disabled
     removes fields from both FormData and constraint validation) must always
     travel together - a hidden field may never block submission. */
  function applyVariant() {
    var v = currentVariant();
    form.setAttribute("data-variant", v);
    agencyOnly.forEach(function (fs) { fs.disabled = v !== "agency"; });
    orgOnly.forEach(function (fs) { fs.disabled = v !== "organization"; });
    cards.forEach(function (card) {
      var input = card.querySelector("input");
      card.classList.toggle("is-checked", !!(input && input.checked));
    });
    rebuildSeam();
  }

  radios.forEach(function (r) { r.addEventListener("change", applyVariant); });

  // script.js calls form.reset() after a successful submit; the reset event
  // fires before values/checked states revert, so resync a tick later.
  form.addEventListener("reset", function () {
    setTimeout(applyVariant, 0);
  });

  /* ---------- Stitched seam ---------- */

  var seam = form.querySelector(".pt-seam");
  var seamCount = document.getElementById("ptSeamCount");
  var ticks = [];
  var activeRequired = [];

  // willValidate is false inside a disabled fieldset, so this list tracks
  // the active variant for free.
  function requiredControls() {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.required && el.willValidate && el.type !== "radio";
    });
  }

  function fieldAnchor(el) {
    return el.closest(".pt-field") || el.closest(".pt-agree") || el;
  }

  function rebuildSeam() {
    if (!seam) return;
    activeRequired = requiredControls();
    ticks.forEach(function (t) { t.remove(); });
    ticks = [];
    var seamRect = seam.getBoundingClientRect();
    if (seamRect.height > 10) {
      activeRequired.forEach(function (el) {
        var a = fieldAnchor(el).getBoundingClientRect();
        var center = a.top + a.height / 2 - seamRect.top;
        var pct = Math.max(0, Math.min(1, center / seamRect.height));
        var tick = document.createElement("span");
        tick.className = "pt-seam-tick";
        tick.style.top = (pct * 100).toFixed(3) + "%";
        seam.appendChild(tick);
        ticks.push(tick);
      });
    }
    updateSeam();
  }

  function updateSeam() {
    if (!seam) return;
    var total = activeRequired.length;
    var done = 0;
    activeRequired.forEach(function (el, i) {
      var ok = el.validity.valid;
      if (ok) done++;
      if (ticks[i]) ticks[i].classList.toggle("is-done", ok);
    });
    form.style.setProperty("--pt-progress", (total ? done / total : 0).toFixed(4));
    if (seamCount) seamCount.textContent = done + " of " + total;
  }

  var updateQueued = false;
  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(function () {
      updateQueued = false;
      updateSeam();
    });
  }

  form.addEventListener("input", scheduleUpdate);
  form.addEventListener("change", scheduleUpdate);

  // layout shifts (fonts settling, viewport resizes, variant swaps handled
  // above) move the field rows - keep tick positions honest
  var rebuildQueued = false;
  function scheduleRebuild() {
    if (rebuildQueued) return;
    rebuildQueued = true;
    requestAnimationFrame(function () {
      rebuildQueued = false;
      rebuildSeam();
    });
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(scheduleRebuild).observe(form);
  } else {
    window.addEventListener("resize", scheduleRebuild);
  }
  window.addEventListener("load", scheduleRebuild);

  applyVariant();
})();

/* ---------- Opening quilt ----------
   A block of patches cycles through the partner roster: partner organizations
   (cities, agencies of record, global orgs, media) lead, licensed adoption
   agencies follow. Every patch carries a mark and nothing else - the marks
   are the point, and a caption under the block says whose they are. The 2x2
   turns on a slower clock than the rest so the block never reads as one
   uniform flicker. A patch whose logo file 404s, turns out to be a 1x1
   placeholder, or is simply too slow falls back to a typographic name plate,
   so the roster can carry entries whose PNGs haven't landed yet.

   Only entries that actually carry a mark drift (see DRIFT below): a partner
   held deliberately without one (logo: null) stays on the roster - and in the
   counts, and on /team - but never takes a slot in the cycle.

   `kind` drives the derived "N licensed agencies" figure in the opening
   meta line - see the counter block at the foot of this file. */
(function () {
  "use strict";

  /* Mirrors the roster published on /team - keep the two in sync. */
  var ROSTER = [
    /* -- partner organizations first -- */
    { kind: "org", name: "City of Orlando", logo: "/png/orlando-logo.png" },
    { kind: "org", name: "UNICEF", logo: "/png/unicef-logo.png" },
    { kind: "org", name: "United States Senate Committee on Finance", logo: "/png/us-senate-finance-logo.png" },
    { kind: "org", name: "Florida Senate", logo: "/png/florida-senate-logo.png" },
    { kind: "org", name: "Florida House of Representatives", logo: "/png/florida-house-logo.png" },
    { kind: "org", name: "Florida Department of Children and Families", logo: "/png/dcf-logo.png" },
    // The City of Winter Park mark was retired from the site; the partner
    // itself stays on the roster and in the counts, but sits out the drift.
    { kind: "org", name: "City of Winter Park", logo: null },
    { kind: "org", name: "City of Oviedo", logo: "/png/oviedo-logo.png" },
    { kind: "org", name: "City of Sanford", logo: "/png/sanford-logo.png" },
    { kind: "org", name: "Orange County", logo: "/png/orange-county-logo.png" },
    { kind: "org", name: "City of Orange City", logo: "/png/orange-city-logo.png" },
    { kind: "org", name: "YGN Youth Global Network", logo: "/png/ygn-logo.png" },
    { kind: "org", name: "FOX 35 Orlando", logo: "/png/fox-35-logo.png" },
    { kind: "org", name: "WFTV Channel 9", logo: "/png/wftv-channel-9-logo.png" },
    { kind: "org", name: "Orlando Sentinel", logo: "/png/orlando-sentinel-logo.png" },
    { kind: "org", name: "Spectrum News 13", logo: "/png/spectrum-news-13-logo.png" },
    { kind: "org", name: "WESH 2", logo: "/png/wesh-2-logo.png" },
    /* -- licensed adoption agencies, United States -- */
    { name: "A Bond of Love Adoption Agency", logo: "/png/a-bond-of-love-logo.png" },
    { name: "A Child's Hope", logo: "/png/a-childs-hope-logo.png" },
    { name: "Adoption Advocates", logo: "/png/adoption-advocates-logo.png" },
    { name: "Adoption and Beyond", logo: "/png/adoption-beyond.png" },
    { name: "Adoption Associates", logo: "/png/adoption-associates-logo.png" },
    { name: "Adoption Centre of Kansas", logo: "/png/adoption-centre-kansas-logo.png" },
    { name: "Adoption Choice Inc.", logo: "/png/adoption-choice-logo.png" },
    { name: "Adoption Choices of Florida", logo: "/png/adoption-choices-florida-logo.png" },
    { name: "Adoption Circle", logo: "/png/adoption-circle-logo.png" },
    { name: "Adoption Network Law Center", logo: "/png/adoption-network-law-center-logo.png" },
    { name: "Adoption Options", logo: "/png/adoption-options-logo.png" },
    { name: "Adoption Rhode Island", logo: "/png/adoption-rhode-island-logo.png" },
    { name: "Adoption Services, Inc.", logo: "/png/adoption-services-inc-logo.png" },
    { name: "Adoptions From The Heart", logo: "/png/afth-logo.png" },
    { name: "Adoptions of Indiana", logo: "/png/adoptions-of-indiana-logo.png" },
    { name: "Ampersand Families", logo: "/png/ampersand-families-logo.png" },
    { name: "Antioch Adoptions", logo: "/png/antioch-adoptions-logo.png" },
    { name: "Arizona's Children Association", logo: "/png/arizonas-children-logo.png" },
    { name: "Boys & Girls Aid", logo: "/png/boys-and-girls-aid-logo.png" },
    { name: "Bright Futures Adoption Center", logo: "/png/bright-futures-logo.png" },
    { name: "Building Arizona Families", logo: "/png/building-arizona-families-logo.png" },
    { name: "Burlington United Methodist Family Services", logo: "/png/burlington-umfs-logo.png" },
    { name: "Canopy Children's Solutions", logo: "/png/canopy-logo.png" },
    { name: "Catholic Charities, Archdiocese of New Orleans", logo: "/png/ccano-logo.png" },
    { name: "Catholic Charities North Dakota", logo: "/png/catholic-charities-nd-logo.png" },
    { name: "Children & Families First", logo: "/png/children-families-first-logo.png" },
    { name: "Children's Home Society of Minnesota", logo: "/png/chs-minnesota-logo.png" },
    { name: "Children's Home Society of North Carolina", logo: "/png/chs-north-carolina-logo.png" },
    { name: "Children's Service Society of Utah", logo: "/png/css-utah-logo.png" },
    { name: "Christian Heritage", logo: "/png/christian-heritage-logo.png" },
    { name: "Connecticut Alliance of Foster and Adoptive Families", logo: "/png/cafaf-logo.png" },
    { name: "Connecting Hearts", logo: "/png/connecting-hearts-logo.png" },
    { name: "Covenant Care Adoptions", logo: "/png/covenant-care-logo.png" },
    { name: "Forever Families Through Adoption", logo: "/png/forever-families-logo.png" },
    { name: "Four Oaks", logo: "/png/four-oaks-logo.png" },
    { name: "Georgia AGAPE", logo: "/png/georgia-agape-logo.png" },
    { name: "Gladney Center for Adoption", logo: "/png/gladney-logo.png" },
    { name: "Greater Hopes", logo: "/png/greater-hopes.png" },
    { name: "Harmony Family Center", logo: "/png/harmony-family-center-logo.png" },
    { name: "Heart of Adoptions, Inc.", logo: "/png/heart-of-adoptions-logo.png" },
    { name: "Hearts of Adoptions Alliance", logo: "/png/hoaa-logo.png" },
    { name: "Holt International", logo: "/png/holt-international-logo.png" },
    { name: "Holy Family Services Adoption and Foster Care", logo: "/png/holy-family-services-logo.png" },
    { name: "KidsFirst Adoption Services", logo: "/png/kidsfirst-logo.png" },
    { name: "Lifeline Children's Services", logo: "/png/lifeline-childrens-logo.png" },
    { name: "Lund", logo: "/png/lund-logo.png" },
    { name: "Lutheran Child and Family Services of Illinois", logo: "/png/lcfs-illinois-logo.png" },
    { name: "Lutheran Social Services of South Dakota", logo: "/png/lss-south-dakota-logo.png" },
    // Nightlight's Greenville office shares this logo; listed once so two
    // identical faces can never sit on screen together.
    { name: "Nightlight Christian Adoptions", logo: "/png/nightlight-logo.png" },
    { name: "Options 4 Adoption", logo: "/png/options4adoption.png" },
    { name: "Paths for Families", logo: "/png/paths-for-families-logo.png" },
    { name: "Shineforth", logo: "/png/shineforth-logo.png" },
    { name: "Spence-Chapin Services to Families and Children", logo: "/png/spence-chapin-logo.png" },
    { name: "Sunrise Children's Services", logo: "/png/sunrise-childrens-services-logo.png" },
    { name: "The Cradle", logo: "/png/the-cradle-logo.png" },
    { name: "The Sacred Portion Children's Outreach", logo: "/png/sacred-portion-logo.png" },
    { name: "Wyoming Children's Society", logo: "/png/wyoming-childrens-society-logo.png" },
    /* -- licensed adoption agencies, international -- */
    { name: "Adoptiehuis (Gewenst Kind vzw)", logo: "/png/adoptiehuis-logo.png" },
    { name: "Ai.Bi. Amici dei Bambini", logo: "/png/aibi-logo.png" },
    { name: "Barnardos Australia", logo: "/png/barnardos-australia-logo.png" },
    { name: "Buckner Kenya", logo: "/png/buckner-kenya-logo.png" },
    { name: "CCAI (Chinese Children Adoption International)", logo: "/png/ccai-logo.png" },
    { name: "Children of the World Delhi", logo: "/png/children-of-the-world-delhi.png" },
    { name: "Compassionate Orphanage", logo: "/png/compassionate-orphanage-logo.png" },
    { name: "Door of Hope", logo: "/png/door-of-hope-logo.png" },
    { name: "Fundación San José para la Adopción", logo: "/png/fundacion-san-jose-logo.png" },
    { name: "Hand in Hand", logo: "/png/hihi-logo.png" },
    { name: "Helping Hands Adoption Mediation Agency", logo: "/png/helping-hands-logo.png" },
    { name: "Japan International Social Service (ISSJ)", logo: "/png/issj-logo.png" },
    { name: "Palestinian Orphans Association", logo: "/png/palestinian-orphans-logo.png" },
    { name: "Sunrise Adoption (Sunrise Family Services Society)", logo: "/png/sunrise-adoption-canada-logo.png" }
  ];

  /* ---------- Derived figures in the opening meta line ----------
     Counted off ROSTER and window.HL_REACH rather than typed into the
     markup, so they stay honest the next time the network grows. Note the
     agency figure trails /team by one: Nightlight appears twice there
     (head office + Greenville) but once here, so two identical faces can
     never drift on screen together. */
  (function () {
    var fills = document.querySelectorAll("[data-pt-count]");
    if (!fills.length) return;

    var reach = window.HL_REACH || { countries: {}, states: {} };
    var totals = {
      agencies: ROSTER.filter(function (e) { return e.kind !== "org"; }).length,
      states: (reach.states.partner || []).length,
      countries: (reach.countries.partner || []).length
    };

    fills.forEach(function (node) {
      var key = node.getAttribute("data-pt-count");
      if (totals[key] != null) node.textContent = String(totals[key]);
    });
  })();

  var host = document.getElementById("ptDrift");
  if (!host) return;
  var indexEl = document.getElementById("ptQuiltIndex");

  /* The cycle draws on the marks only. ROSTER above stays whole - the counters
     just overhead read it, and /team lists every partner either way. */
  var DRIFT = ROSTER.filter(function (entry) { return !!entry.logo; });

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var FADE_MS = 460;
  /* Two of the marks are over 600KB. Rather than let one freeze a patch on a
     cold connection, give up on it and fall through to the name plate. */
  var LOAD_BAIL_MS = 1200;
  // how long decode() gets to help before we go with the loaded mark anyway
  var DECODE_GRACE_MS = 120;
  /* Under this a mark cannot fill the 2x2 without visibly softening - the
     roster runs from 28px to 1445px - so small marks are kept to the small
     patches, where they sit at their own size and look deliberate. */
  var LOWRES_PX = 120;
  // reduced motion still rotates (instantly), just at a calmer cadence
  var markEvery = reduceMotion ? 6400 : 2600;
  var leadEvery = reduceMotion ? 11000 : 4600;

  /* Layout tables, one per breakpoint, mirroring the grid-template-areas in
     partner.css. Every patch carries a mark. `big` marks a 2x2, which only
     ever draws marks large enough to hold it; `lead` is the one patch that
     runs on the slower clock and drives the running index.

     `order` is the rotation sequence: consecutive turns never land on two
     patches that touch, so the block never appears to ripple. */
  var FULL_LAYOUT = {
    order: ["m2", "m5", "m6", "m8", "m9", "m4", "m7", "m3", "m10"],
    patches: [
      { area: "m1", big: true, lead: true },
      { area: "m2", alt: true },
      { area: "m3" },
      { area: "m4" },
      { area: "m5", alt: true },
      { area: "m6", alt: true },
      { area: "m7" },
      { area: "m8", big: true },
      { area: "m9" },
      { area: "m10", alt: true }
    ]
  };

  var COMPACT_LAYOUT = {
    order: ["m2", "m5", "m3", "m4"],
    patches: [
      { area: "m1", big: true, lead: true },
      { area: "m2", alt: true },
      { area: "m3" },
      { area: "m4" },
      { area: "m5", alt: true }
    ]
  };

  var TINY_LAYOUT = {
    order: ["m2", "m3"],
    patches: [
      { area: "m1", big: true, lead: true },
      { area: "m2", alt: true },
      { area: "m3" }
    ]
  };

  var markSlots = [];
  var leadSlot = null;
  var cursor = 0;
  var markTick = 0;
  var markTimer = null;
  var leadTimer = null;
  var inView = true;
  var lastLayout = null;
  var seedTimers = [];
  /* Marks that turned out too small for the plate, learned from naturalWidth
     the first time each one lands there. Deliberately not a hardcoded list -
     it cannot go stale when a PNG is replaced. */
  var lowRes = Object.create(null);

  function pad3(n) {
    return n < 10 ? "00" + n : n < 100 ? "0" + n : String(n);
  }

  /* One cursor feeds both clocks, so no two patches can hold the same mark:
     a given patch refills every ~16s, and in that time the two clocks together
     consume about nine of the 87 entries. */
  function nextEntry(forBig) {
    for (var guard = 0; guard < DRIFT.length; guard++) {
      var idx = cursor;
      cursor = (cursor + 1) % DRIFT.length;
      if (forBig && lowRes[DRIFT[idx].logo]) continue;
      return { entry: DRIFT[idx], ordinal: idx + 1 };
    }
    return { entry: DRIFT[0], ordinal: 1 };
  }

  /* Load and decode before the turn starts, not after it ends - otherwise a
     patch fades in empty on a cold cache and fills in a beat later. */
  function loadMark(entry, done) {
    var img = new Image();
    var settled = false;
    var grace = null;
    /* Give up only on a mark that never arrives. If one has loaded by now we
       use it regardless - the bail is here for the 600KB seals on a cold
       connection, not to throw away a picture we already hold. */
    var bail = setTimeout(function () {
      finish(img.complete && img.naturalWidth > 1);
    }, LOAD_BAIL_MS);

    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(bail);
      clearTimeout(grace);
      done(ok ? img : null);
    }

    img.alt = "";
    img.decoding = "async";
    // the headline is the LCP here; logos must not outrank the font preloads
    img.setAttribute("fetchpriority", "low");
    img.addEventListener("error", function () { finish(false); });
    img.addEventListener("load", function () {
      // a 1x1 placeholder loads cleanly, so "error" never fires for it
      if (img.naturalWidth <= 1 && img.naturalHeight <= 1) return finish(false);
      if (img.decode) {
        /* Decode ahead of the turn so the swap cannot stutter - but never
           block on it. decode() both rejects and, in a tab that is not
           compositing, stalls outright on marks that are perfectly fine. */
        img.decode().then(function () { finish(true); }, function () { finish(true); });
        grace = setTimeout(function () { finish(true); }, DECODE_GRACE_MS);
      } else {
        finish(true);
      }
    });
    img.src = entry.logo;
  }

  function nameplate(entry) {
    var name = document.createElement("span");
    name.className = "pt-patch-name";
    name.textContent = entry.name;
    return name;
  }

  function render(slot, pick, img) {
    var entry = pick.entry;
    var face = document.createElement("span");
    face.className = "pt-patch-face";

    if (img) {
      // the cap that keeps every mark at or under 1:1 - see partner.css
      img.style.setProperty("--nat-w", img.naturalWidth + "px");
      img.style.setProperty("--nat-h", img.naturalHeight + "px");
    }

    face.appendChild(img || nameplate(entry));

    /* Remember a mark that turned out too small to carry a 2x2, so it is
       never pulled for one again - it reads better at its own size in one of
       the singles. Learned from naturalWidth rather than kept as a list, so
       it cannot go stale when a PNG is replaced. */
    if (slot.big && img &&
        Math.max(img.naturalWidth, img.naturalHeight) < LOWRES_PX) {
      lowRes[entry.logo] = true;
    }

    /* The ordinal is the one captured when this mark was pulled, not a live
       read - the cursor moves for every other patch too. */
    if (slot.lead && indexEl) {
      indexEl.textContent = pad3(pick.ordinal) + " / " + pad3(DRIFT.length);
    }

    slot.el.textContent = "";
    slot.el.appendChild(face);
  }

  // two frames: the face has to be laid out at opacity 0 before it can transition
  function fadeIn(slot) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        slot.el.classList.remove("is-out");
        setTimeout(function () {
          slot.el.classList.remove("is-turning");
        }, 560);
      });
    });
  }

  function swap(slot) {
    var pick = nextEntry(slot.big);
    var token = ++slot.token;
    loadMark(pick.entry, function (img) {
      if (slot.token !== token) return; // the slot moved on while we waited
      if (reduceMotion) {
        render(slot, pick, img);
        return;
      }
      slot.el.classList.add("is-turning", "is-out");
      setTimeout(function () {
        if (slot.token !== token) return;
        render(slot, pick, img);
        fadeIn(slot);
      }, FADE_MS);
    });
  }

  function build(layout) {
    var byArea = {};
    // a rebuild abandons the previous block, so drop its pending seeds rather
    // than let them fetch marks for patches that are no longer in the document
    seedTimers.forEach(clearTimeout);
    seedTimers = [];
    host.textContent = "";
    markSlots = [];
    leadSlot = null;
    markTick = 0;

    layout.patches.forEach(function (def) {
      var el = document.createElement("div");
      var cls = "pt-patch";
      if (def.big) cls += " pt-patch--big";
      if (def.alt) cls += " pt-patch--alt";
      el.className = cls;
      el.style.gridArea = def.area;
      host.appendChild(el);

      var slot = { el: el, big: !!def.big, lead: !!def.lead, token: 0 };
      byArea[def.area] = slot;
      if (def.lead) leadSlot = slot;
    });

    markSlots = layout.order
      .map(function (area) { return byArea[area]; })
      .filter(Boolean);

    /* Seed on a stagger. This paces the fetches as well as the reveal: the
       opening set is ~1.5MB, and firing it at once would contend with the
       two font preloads for the headline. */
    var seeds = (leadSlot ? [leadSlot] : []).concat(markSlots);
    seeds.forEach(function (slot, i) {
      slot.el.classList.add("is-out");
      seedTimers.push(setTimeout(function () {
        var pick = nextEntry(slot.big);
        var token = ++slot.token;
        loadMark(pick.entry, function (img) {
          if (slot.token !== token) return;
          render(slot, pick, img);
          if (reduceMotion) slot.el.classList.remove("is-out");
          else fadeIn(slot);
        });
      }, 250 + i * 110));
    });
  }

  function advanceMark() {
    if (!markSlots.length) return;
    swap(markSlots[markTick++ % markSlots.length]);
  }

  function advanceLead() {
    if (leadSlot) swap(leadSlot);
  }

  function sync() {
    /* Reconcile the layout here too. A tab that was hidden while the window
       changed size never ran the rendering steps that dispatch matchMedia
       change events, so it can come back holding the wrong table - and a
       patch whose grid area is not in the active template auto-places itself
       into an implicit row. rebuild() is a comparison when nothing moved. */
    rebuild();
    var active = inView && !document.hidden;
    if (active && !markTimer) {
      markTimer = setInterval(advanceMark, markEvery);
      leadTimer = setInterval(advanceLead, leadEvery);
    } else if (!active && markTimer) {
      clearInterval(markTimer);
      clearInterval(leadTimer);
      markTimer = null;
      leadTimer = null;
    }
  }

  /* Rebuilding on a breakpoint rather than hiding surplus patches in CSS is
     what stops a phone cycling - and fetching - seven marks to show two.
     `cursor` is not reset, so the sequence carries across the change. */
  var mqCompact = window.matchMedia && window.matchMedia("(max-width: 1024px)");
  var mqTiny = window.matchMedia && window.matchMedia("(max-width: 640px)");

  function currentLayout() {
    if (mqTiny && mqTiny.matches) return TINY_LAYOUT;
    if (mqCompact && mqCompact.matches) return COMPACT_LAYOUT;
    return FULL_LAYOUT;
  }

  function rebuild() {
    var layout = currentLayout();
    if (layout === lastLayout) return;
    lastLayout = layout;
    build(layout);
  }

  [mqCompact, mqTiny].forEach(function (mq) {
    if (!mq) return;
    if (mq.addEventListener) mq.addEventListener("change", rebuild);
    else if (mq.addListener) mq.addListener(rebuild);
  });

  // belt and braces: resize fires where a deferred change event may not
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 150);
  });

  rebuild();

  /* Watch the quilt, never the hero: a 100svh section clears a 0.15 threshold
     almost permanently and would keep pulling logos well off screen. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.15 }).observe(host);
  }

  document.addEventListener("visibilitychange", sync);
  sync();
})();
