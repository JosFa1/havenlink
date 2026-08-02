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

/* ---------- Opening logo drift ----------
   Six cards cycle through the partner roster: partner organizations
   (cities, agencies of record, global orgs) lead, licensed adoption
   agencies follow. A card whose logo file is missing or empty falls
   back to a typographic name card, so the roster can carry entries
   whose PNGs haven't landed yet. */
(function () {
  "use strict";

  var host = document.getElementById("ptDrift");
  if (!host) return;

  /* Mirrors the roster published on /team - keep the two in sync. */
  var ROSTER = [
    /* -- partner organizations first -- */
    { name: "City of Orlando", logo: "/png/orlando-logo.png" },
    { name: "YGN Youth Global Network", logo: "/png/ygn-logo.png" },
    { name: "Florida Department of Children and Families", logo: "/png/dcf-logo.png" },
    { name: "City of Winter Park", logo: "/png/winter-park-logo.png" },
    { name: "City of Oviedo", logo: "/png/oviedo-logo.png" },
    { name: "City of Sanford", logo: "/png/sanford-logo.png" },
    { name: "UNFPA", logo: "/png/unfpa-logo.png" },
    /* -- licensed adoption agencies, United States -- */
    { name: "Adoption and Beyond", logo: "/png/adoption-beyond.png" },
    { name: "Adoption Choices of Florida", logo: "/png/adoption-choices-florida-logo.png" },
    { name: "Adoption Network Law Center", logo: "/png/adoption-network-law-center-logo.png" },
    { name: "Adoption Services, Inc.", logo: "/png/adoption-services-inc-logo.png" },
    { name: "Adoptions From The Heart", logo: "/png/afth-logo.png" },
    { name: "Arizona's Children Association", logo: "/png/arizonas-children-logo.png" },
    { name: "Bright Futures Adoption Center", logo: "/png/bright-futures-logo.png" },
    { name: "Children's Home Society of Minnesota", logo: "/png/chs-minnesota-logo.png" },
    { name: "Children's Home Society of North Carolina", logo: "/png/chs-north-carolina-logo.png" },
    { name: "Connecticut Alliance of Foster and Adoptive Families", logo: "/png/cafaf-logo.png" },
    { name: "Connecting Hearts", logo: "/png/connecting-hearts-logo.png" },
    { name: "Covenant Care Adoptions", logo: "/png/covenant-care-logo.png" },
    { name: "Gladney Center for Adoption", logo: "/png/gladney-logo.png" },
    { name: "Greater Hopes", logo: "/png/greater-hopes.png" },
    { name: "Harmony Family Center", logo: "/png/harmony-family-center-logo.png" },
    { name: "Heart of Adoptions, Inc.", logo: "/png/heart-of-adoptions-logo.png" },
    { name: "Hearts of Adoptions Alliance", logo: "/png/hoaa-logo.png" },
    { name: "Holt International", logo: "/png/holt-international-logo.png" },
    { name: "KidsFirst Adoption Services", logo: "/png/kidsfirst-logo.png" },
    { name: "Lifeline Children's Services", logo: "/png/lifeline-childrens-logo.png" },
    // Nightlight's Greenville office shares this logo; listed once so two
    // identical faces can never sit on screen together.
    { name: "Nightlight Christian Adoptions", logo: "/png/nightlight-logo.png" },
    { name: "Options 4 Adoption", logo: "/png/options4adoption.png" },
    { name: "Shineforth", logo: "/png/shineforth-logo.png" },
    { name: "Spence-Chapin Services to Families and Children", logo: "/png/spence-chapin-logo.png" },
    { name: "The Cradle", logo: "/png/the-cradle-logo.png" },
    { name: "The Sacred Portion Children's Outreach", logo: "/png/sacred-portion-logo.png" },
    /* -- licensed adoption agencies, international -- */
    { name: "Barnardos Australia", logo: "/png/barnardos-australia-logo.png" },
    { name: "Buckner Kenya", logo: "/png/buckner-kenya-logo.png" },
    { name: "CCAI (Chinese Children Adoption International)", logo: "/png/ccai-logo.png" },
    { name: "Children of the World Delhi", logo: "/png/children-of-the-world-delhi.png" },
    { name: "Compassionate Orphanage", logo: "/png/compassionate-orphanage-logo.png" },
    { name: "Door of Hope", logo: "/png/door-of-hope-logo.png" },
    { name: "Hand in Hand", logo: "/png/hihi-logo.png" },
    { name: "Palestinian Orphans Association", logo: "/png/palestinian-orphans-logo.png" }
  ];

  var SLOT_COUNT = 6;
  var FADE_MS = 460;
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // reduced motion still rotates (instantly), just at a calmer cadence
  var swapEvery = reduceMotion ? 6400 : 2600;

  function buildFace(entry) {
    var face = document.createElement("span");
    face.className = "pt-drift-face";
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("error", function () {
      var name = document.createElement("span");
      name.className = "pt-drift-name";
      name.textContent = entry.name;
      face.textContent = "";
      face.appendChild(name);
    });
    img.src = entry.logo;
    face.appendChild(img);
    return face;
  }

  var slots = [];
  var next = 0;

  for (var i = 0; i < SLOT_COUNT; i++) {
    var card = document.createElement("figure");
    card.className = "pt-drift-card is-out";
    card.appendChild(buildFace(ROSTER[next++ % ROSTER.length]));
    host.appendChild(card);
    slots.push(card);
  }

  // staggered first reveal, timed to land with the panel's hm-reveal
  slots.forEach(function (card, idx) {
    setTimeout(function () {
      card.classList.remove("is-out");
    }, 250 + idx * 110);
  });

  function swapCard(card, entry) {
    if (reduceMotion) {
      card.textContent = "";
      card.appendChild(buildFace(entry));
      return;
    }
    card.classList.add("is-out");
    setTimeout(function () {
      card.textContent = "";
      card.appendChild(buildFace(entry));
      // two frames so the incoming face paints hidden before fading in
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          card.classList.remove("is-out");
        });
      });
    }, FADE_MS);
  }

  // non-adjacent slot order so consecutive swaps never touch neighbors
  var SLOT_ORDER = [0, 3, 1, 4, 2, 5];
  var tickCount = 0;

  function advance() {
    var slot = slots[SLOT_ORDER[tickCount++ % SLOT_ORDER.length]];
    swapCard(slot, ROSTER[next++ % ROSTER.length]);
  }

  /* run only while the tab is visible and the panel is on screen */
  var timer = null;
  var inView = !("IntersectionObserver" in window);

  function sync() {
    var active = inView && !document.hidden;
    if (active && !timer) timer = setInterval(advance, swapEvery);
    if (!active && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.15 }).observe(host);
  }

  document.addEventListener("visibilitychange", sync);
  sync();
})();
