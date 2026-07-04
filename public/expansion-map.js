/**
 * Global Reach expansion map (Team page).
 *
 * Colours partner / in-negotiation regions on a self-hosted world map, and
 * reveals a U.S. states inset when the United States is hovered, focused, or
 * tapped. Everything is same-origin (no CDN) to satisfy the site CSP.
 *
 * Region codes are lowercase: ISO 3166-1 alpha-2 for countries, USPS 2-letter
 * for states. To update the real footprint, edit EXPANSION_DATA below — that is
 * the only thing that needs to change. "partner" always wins over "negotiating"
 * when a region appears in both lists.
 */
(function () {
  'use strict';

  var EXPANSION_DATA = {
    countries: {
      // 'us' stays a partner so the United States is dyed fully on the world map
      // and remains the gateway to the states inset. Then: Brazil, Bulgaria,
      // Haiti, China (covers Hong Kong), Hungary.
      partner: ['us', 'br', 'bg', 'ht', 'cn', 'hu'],
      // India, Philippines, Ukraine, Bulgaria, Romania, Uzbekistan, Canada.
      // Bulgaria is also a partner; "partner" wins, so it renders navy.
      negotiating: ['in', 'ph', 'ua', 'bg', 'ro', 'uz', 'ca']
    },
    states: {
      // Kansas, Pennsylvania, Georgia, Tennessee, Michigan, Florida
      partner: ['ks', 'pa', 'ga', 'tn', 'mi', 'fl'],
      negotiating: ['sc'] // South Carolina
    }
  };

  var root = document.getElementById('expansionMap');
  if (!root) return; // this script is a no-op on every page except the Team page

  var worldBox = document.getElementById('mapWorld');
  var usBox = document.getElementById('mapUS');
  var inset = document.getElementById('usInset');
  var insetClose = inset ? inset.querySelector('.map-inset-close') : null;
  var tooltip = document.getElementById('mapTooltip');

  var norm = function (s) { return String(s == null ? '' : s).toLowerCase(); };

  /* ---------------------------------------------------------------- colour */
  function applyStatus(svg, groups) {
    if (!svg) return;
    var partner = new Set((groups.partner || []).map(norm));
    var negotiating = new Set((groups.negotiating || []).map(norm));
    svg.querySelectorAll('.map-region').forEach(function (el) {
      var code = norm(el.getAttribute('data-region'));
      if (partner.has(code)) el.classList.add('is-partner');            // partner wins
      else if (negotiating.has(code)) el.classList.add('is-negotiating');
    });
  }

  /* --------------------------------------------------------------- tooltip */
  var lastHover = null;
  function statusOf(el) {
    if (el.classList.contains('is-partner')) return 'partner';
    if (el.classList.contains('is-negotiating')) return 'negotiating';
    return '';
  }
  function nameOf(el) {
    var t = el.querySelector('title');
    return (t && t.textContent) || (el.getAttribute('data-region') || '').toUpperCase();
  }
  function positionTooltip(x, y) {
    if (!tooltip) return;
    var pad = 14;
    var w = tooltip.offsetWidth || 0;
    var left = x + pad;
    if (left + w + 8 > window.innerWidth) left = x - w - pad; // flip near right edge
    tooltip.style.left = left + 'px';
    tooltip.style.top = (y + pad) + 'px';
  }
  function onMove(e) {
    if (!tooltip) return;
    var el = e.target && e.target.closest ? e.target.closest('.map-region') : null;
    if (!el) { hideTooltip(); return; }
    if (el !== lastHover) {
      lastHover = el;
      var status = statusOf(el);
      var label = status === 'partner' ? 'Partner'
                : status === 'negotiating' ? 'In negotiation' : '';
      tooltip.innerHTML = '<span class="tt-name"></span>' +
        (label ? '<span class="tt-status tt-' + status + '">' + label + '</span>' : '');
      tooltip.querySelector('.tt-name').textContent = nameOf(el); // textContent = XSS-safe
      tooltip.hidden = false;
    }
    positionTooltip(e.clientX, e.clientY);
  }
  function hideTooltip() { lastHover = null; if (tooltip) tooltip.hidden = true; }
  function wireTooltip(container) {
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', hideTooltip);
  }

  /* ------------------------------------------------------------- US inset */
  var usTrigger = null;
  var closeTimer = null;
  var hideTimer = null;

  function openInset() {
    if (!inset) return;
    clearTimeout(hideTimer);
    inset.hidden = false;
    // next frame so the browser registers the un-hidden state before we
    // transition, otherwise the "expand" animation is skipped.
    requestAnimationFrame(function () { inset.classList.add('open'); });
    if (usTrigger) usTrigger.setAttribute('aria-expanded', 'true');
  }
  function closeInset() {
    if (!inset) return;
    inset.classList.remove('open');
    if (usTrigger) usTrigger.setAttribute('aria-expanded', 'false');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!inset.classList.contains('open')) inset.hidden = true;
    }, 300);
  }
  function scheduleClose() { clearTimeout(closeTimer); closeTimer = setTimeout(closeInset, 200); }
  function cancelClose() { clearTimeout(closeTimer); }
  function toggleInset() { if (inset.classList.contains('open')) closeInset(); else openInset(); }
  function isUS(node) { return !!(node && node.closest && node.closest('[data-region="us"]')); }

  function wireUS(svg) {
    var usEls = svg.querySelectorAll('[data-region="us"]');
    if (!usEls.length) return;
    usEls.forEach(function (el) {
      el.classList.add('map-region--us');
      el.addEventListener('mouseenter', function () { cancelClose(); openInset(); });
      el.addEventListener('mouseleave', scheduleClose);
      el.addEventListener('click', function (e) { e.stopPropagation(); toggleInset(); });
    });
    // one keyboard/AT entry point on the mainland path
    usTrigger = usEls[0];
    usTrigger.setAttribute('tabindex', '0');
    usTrigger.setAttribute('role', 'button');
    usTrigger.setAttribute('aria-label', 'United States — show partner states');
    usTrigger.setAttribute('aria-expanded', 'false');
    usTrigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggleInset(); }
    });
    usTrigger.addEventListener('focus', function () { cancelClose(); openInset(); });
  }

  if (inset) {
    inset.addEventListener('mouseenter', cancelClose);
    inset.addEventListener('mouseleave', scheduleClose);
  }
  if (insetClose) insetClose.addEventListener('click', function (e) { e.stopPropagation(); closeInset(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeInset(); });
  document.addEventListener('click', function (e) {
    if (inset && !inset.hidden && !inset.contains(e.target) && !isUS(e.target)) closeInset();
  });

  /* ----------------------------------------------------------- load & init */
  function loadSVG(url, box) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      box.innerHTML = text;
      return box.querySelector('svg');
    });
  }

  Promise.all([
    loadSVG('/maps/world.svg', worldBox),
    loadSVG('/maps/us-states.svg', usBox)
  ]).then(function (svgs) {
    applyStatus(svgs[0], EXPANSION_DATA.countries);
    applyStatus(svgs[1], EXPANSION_DATA.states);
    wireTooltip(worldBox);
    wireTooltip(usBox);
    wireUS(svgs[0]);
    root.classList.add('is-ready');
  }).catch(function (err) {
    console.error('[expansion-map]', err);
    root.innerHTML = '<p class="map-fallback">Our interactive reach map couldn’t be loaded right now.</p>';
  });
})();
