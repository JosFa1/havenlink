/* HavenLink partner page behavior: the agency/organization form variant
   switch and the stitched-seam progress indicator. Shared behavior (nav
   state, reveals) lives in editorial.js. script.js owns the actual form
   submission — this file never touches the submit flow. */
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
     travel together — a hidden field may never block submission. */
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
  // above) move the field rows — keep tick positions honest
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
