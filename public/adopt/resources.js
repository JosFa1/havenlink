/**
 * Post-Adoption Resource Finder (Step 4) — front end.
 *
 * Fetches nearby resources from our own API (GET /api/resources) and renders them as
 * a synced Google Map + list. The Maps JS API is loaded on demand with the key from
 * GET /api/resources/maps-config (never hardcoded here), so the same static file works
 * in dev and prod — only the env var differs. Everything except the Google Maps script
 * and its tiles is same-origin. Vanilla IIFE to match the rest of public/.
 */
(function () {
  "use strict";

  var form = document.getElementById("rf-form");
  if (!form) return; // no-op on every page except the finder

  var zipInput = document.getElementById("rf-zip");
  var radiusSel = document.getElementById("rf-radius");
  var catEls = form.querySelectorAll('input[name="category"]');
  var submitBtn = document.getElementById("rf-submit");
  var msgEl = document.getElementById("rf-msg");
  var mapEl = document.getElementById("rf-map");
  var resultsEl = document.getElementById("rf-results");
  var countEl = document.getElementById("rf-count");
  var listEl = document.getElementById("rf-list");

  var map = null;
  var infoWindow = null;
  var markers = [];       // google.maps.Marker[], index-aligned with the merged list
  var originMarker = null;
  var radiusCircle = null;
  var mapsPromise = null;

  /* ------------------------------------------------------------------ helpers */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function showMsg(kind, text) {
    msgEl.textContent = text;
    msgEl.className = "rf-msg show " + kind;
  }
  function hideMsg() { msgEl.className = "rf-msg"; }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "Searching…" : "Find resources";
  }

  /* --------------------------------------------------- Google Maps on-demand */
  function loadMaps() {
    if (window.google && window.google.maps) return Promise.resolve();
    if (mapsPromise) return mapsPromise;
    mapsPromise = fetch("/api/resources/maps-config", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        if (!cfg || !cfg.configured || !cfg.apiKey) throw new Error("MAPS_NOT_CONFIGURED");
        return new Promise(function (resolve, reject) {
          window.__havenMapsReady = function () { resolve(); };
          var s = document.createElement("script");
          s.src = "https://maps.googleapis.com/maps/api/js?key=" +
            encodeURIComponent(cfg.apiKey) + "&loading=async&callback=__havenMapsReady";
          s.async = true;
          s.onerror = function () { reject(new Error("MAPS_SCRIPT_FAILED")); };
          document.head.appendChild(s);
        });
      });
    return mapsPromise;
  }

  /* ---------------------------------------------------------- data shaping */
  // A facility offering several categories comes back as one row per category; merge
  // those into a single place with multiple tags so the map/list show one entry.
  function mergeResults(results) {
    var byKey = {};
    var order = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var key = r.name + "|" + r.lat.toFixed(4) + "|" + r.lng.toFixed(4);
      if (!byKey[key]) {
        byKey[key] = {
          name: r.name, lat: r.lat, lng: r.lng, address: r.address, city: r.city,
          state: r.state, zip: r.zip, phone: r.phone, website: r.website,
          distance_miles: r.distance_miles, categories: [r.category],
        };
        order.push(key);
      } else {
        var m = byKey[key];
        if (m.categories.indexOf(r.category) === -1) m.categories.push(r.category);
        if (!m.phone && r.phone) m.phone = r.phone;
        if (!m.website && r.website) m.website = r.website;
        if (r.distance_miles < m.distance_miles) m.distance_miles = r.distance_miles;
      }
    }
    return order.map(function (k) { return byKey[k]; });
  }

  function catTags(cats, labels) {
    return cats.map(function (c) { return '<span class="rf-tag">' + esc(labels[c] || c) + "</span>"; }).join("");
  }

  function contactLine(m) {
    var bits = [];
    if (m.address) bits.push(esc(m.address));
    var cityState = [m.city, m.state].filter(Boolean).join(", ");
    if (cityState) bits.push(esc(cityState) + (m.zip ? " " + esc(m.zip) : ""));
    return bits.join(" · ");
  }

  function infoHtml(m, labels) {
    var html = '<div class="gm-iw"><h4>' + esc(m.name) + "</h4>";
    html += '<p>' + catTags(m.categories, labels) + "</p>";
    var cl = contactLine(m);
    if (cl) html += "<p>" + cl + "</p>";
    if (m.phone) html += '<p><a href="tel:' + esc(m.phone) + '">' + esc(m.phone) + "</a></p>";
    if (m.website) {
      var href = /^https?:\/\//i.test(m.website) ? m.website : "https://" + m.website;
      html += '<p><a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">Visit website ↗</a></p>';
    }
    html += '<p style="opacity:.7">~' + m.distance_miles + " mi away</p></div>";
    return html;
  }

  /* --------------------------------------------------------------- rendering */
  function renderList(merged, labels, radiusMiles) {
    resultsEl.hidden = false;
    countEl.textContent = merged.length === 0
      ? "No resources found"
      : merged.length + " resource" + (merged.length === 1 ? "" : "s") + " within " + radiusMiles + " miles";
    if (merged.length === 0) { listEl.innerHTML = ""; return; }
    listEl.innerHTML = merged.map(function (m, i) {
      var cl = contactLine(m);
      return '<div class="rf-item" data-index="' + i + '">' +
        '<div class="rf-item-name">' + esc(m.name) + "</div>" +
        '<div class="rf-item-meta">' + catTags(m.categories, labels) +
        (cl ? "<br>" + cl : "") +
        (m.phone ? "<br>" + esc(m.phone) : "") +
        "<br>~" + m.distance_miles + " mi away</div></div>";
    }).join("");
    Array.prototype.forEach.call(listEl.querySelectorAll(".rf-item"), function (el) {
      el.addEventListener("click", function () { focusMarker(Number(el.getAttribute("data-index"))); });
    });
  }

  function clearMarkers() {
    markers.forEach(function (mk) { mk.setMap(null); });
    markers = [];
    if (originMarker) { originMarker.setMap(null); originMarker = null; }
    if (radiusCircle) { radiusCircle.setMap(null); radiusCircle = null; }
  }

  function renderMap(origin, merged, labels, radiusMiles) {
    var center = { lat: origin.lat, lng: origin.lng };
    if (!map) {
      map = new google.maps.Map(mapEl, { center: center, zoom: 11, mapTypeControl: false, streetViewControl: false });
      infoWindow = new google.maps.InfoWindow();
    } else {
      map.setCenter(center);
    }
    clearMarkers();

    originMarker = new google.maps.Marker({
      position: center, map: map, title: "Search center (" + origin.zip + ")", zIndex: 9999,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#1a73e8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
    });
    radiusCircle = new google.maps.Circle({
      map: map, center: center, radius: radiusMiles * 1609.34,
      strokeColor: "#1a73e8", strokeOpacity: 0.3, strokeWeight: 1, fillColor: "#1a73e8", fillOpacity: 0.05,
    });

    var bounds = new google.maps.LatLngBounds();
    bounds.extend(center);
    merged.forEach(function (m, i) {
      var pos = { lat: m.lat, lng: m.lng };
      var marker = new google.maps.Marker({ position: pos, map: map, title: m.name });
      marker.addListener("click", function () { openInfo(i, labels); });
      markers.push(marker);
      bounds.extend(pos);
    });

    if (merged.length > 0) {
      map.fitBounds(bounds);
      google.maps.event.addListenerOnce(map, "idle", function () {
        if (map.getZoom() > 15) map.setZoom(15);
      });
    } else {
      map.setZoom(11);
    }
  }

  function openInfo(i, labels) {
    if (!markers[i]) return;
    infoWindow.setContent(infoHtml(lastMerged[i], labels));
    infoWindow.open(map, markers[i]);
  }

  function focusMarker(i) {
    Array.prototype.forEach.call(listEl.querySelectorAll(".rf-item"), function (el, idx) {
      el.classList.toggle("active", idx === i);
    });
    if (!map || !markers[i]) return;
    map.panTo(markers[i].getPosition());
    if (map.getZoom() < 12) map.setZoom(13);
    openInfo(i, lastLabels);
  }

  /* ------------------------------------------------------------- controller */
  var lastMerged = [];
  var lastLabels = {};

  function onSubmit(e) {
    e.preventDefault();
    var zip = zipInput.value.trim();
    if (!/^\d{5}$/.test(zip)) { showMsg("error", "Enter a valid 5-digit ZIP code."); return; }
    var cats = Array.prototype.filter.call(catEls, function (c) { return c.checked; })
      .map(function (c) { return c.value; });
    if (cats.length === 0) { showMsg("error", "Select at least one category."); return; }

    setLoading(true);
    hideMsg();
    var params = new URLSearchParams({ zip: zip, radius: radiusSel.value, categories: cats.join(",") });
    fetch("/api/resources?" + params.toString(), { credentials: "same-origin" })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        if (!r.ok) { showMsg("error", (r.data && r.data.error) || "Search failed. Please try again."); return; }
        return render(r.data);
      })
      .catch(function () { showMsg("error", "Network error. Please check your connection and try again."); })
      .finally(function () { setLoading(false); });
  }

  function render(data) {
    var labels = {};
    (data.allCategories || []).forEach(function (c) { labels[c.id] = c.label; });
    var merged = mergeResults(data.results || []);
    lastMerged = merged;
    lastLabels = labels;

    renderList(merged, labels, data.radiusMiles);

    return loadMaps().then(function () {
      renderMap(data.origin, merged, labels, data.radiusMiles);
      if (merged.length === 0) {
        showMsg("info", "No matching resources within " + data.radiusMiles +
          " miles. Try a larger distance or more categories.");
      }
    }).catch(function (err) {
      // The list still works without the map.
      mapEl.innerHTML = '<div style="padding:1rem;font-size:.9rem;color:#555;">' +
        (err && err.message === "MAPS_NOT_CONFIGURED"
          ? "Map is not configured in this environment — results are listed to the right."
          : "The map couldn't load right now — results are listed to the right.") + "</div>";
      if (merged.length === 0) {
        showMsg("info", "No matching resources within " + data.radiusMiles + " miles.");
      }
    });
  }

  form.addEventListener("submit", onSubmit);
})();
