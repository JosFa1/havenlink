/**
 * Post-Adoption Resource Finder (Step 5, "The Cartography") — front end.
 *
 * Fetches nearby resources from our own API (GET /api/resources) and renders them as
 * a synced Google Map + field-notes ledger. The map is recolored into the editorial
 * paper/ink palette (MAP_STYLE) with numbered terracotta station markers that align
 * 1:1 with the ledger indices; each entry carries a distance-and-bearing readout
 * ("2.4 mi · NE"). The Maps JS API is loaded on demand with the key from
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
    var label = submitBtn.querySelector(".rf-submit-label");
    if (label) label.textContent = on ? "Surveying…" : "Run the survey";
    else submitBtn.textContent = on ? "Surveying…" : "Run the survey";
  }

  /* ------------------------------------------------- cartography (map skin) */
  // Classic styled-map JSON recoloring the base map into the editorial paper/
  // ink palette. NOTE: `styles` is silently ignored if a mapId is ever added
  // to the Map constructor — cloud styles would have to take over then.
  var MAP_STYLE = [
    { elementType: "geometry", stylers: [{ color: "#f1ede6" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#4a5468" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#faf8f5" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d8d2c6" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#14213d" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#ece7dd" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#faf8f5" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2dacc" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f4ead9" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#dfd3bd" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7386" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#dde1e7" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#8a93a6" }] },
  ];

  // numbered terracotta survey stations, index-aligned with the ledger
  function stationIcon(scale) {
    return {
      path: google.maps.SymbolPath.CIRCLE, scale: scale,
      fillColor: "#b4551f", fillOpacity: 1, strokeColor: "#faf8f5", strokeWeight: 2,
    };
  }

  var COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  // initial great-circle bearing from the search origin, as an 8-point compass direction
  function bearingDir(origin, m) {
    var toRad = Math.PI / 180;
    var p1 = origin.lat * toRad, p2 = m.lat * toRad;
    var dl = (m.lng - origin.lng) * toRad;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    var deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return COMPASS[Math.round(deg / 45) % 8];
  }

  function distLine(m) {
    // ZIP-centroid-geocoded rows can land exactly on the origin — a bearing there is noise
    if (m.distance_miles < 0.1) return "at origin";
    return m.distance_miles + " mi" + (m.dir ? " · " + m.dir : "");
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
          // Google invokes this hook when the browser key is invalid, disabled,
          // or blocked by referrer restrictions. Without it the script can load
          // while leaving Google's red error overlay over the map forever.
          var previousAuthFailure = window.gm_authFailure;
          window.gm_authFailure = function () {
            window.gm_authFailure = previousAuthFailure;
            reject(new Error("MAPS_AUTH_FAILED"));
          };
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
    html += '<p class="gm-iw-dist">' + esc(distLine(m)) + "</p></div>";
    return html;
  }

  /* --------------------------------------------------------------- rendering */
  function renderList(merged, labels, radiusMiles, zip) {
    resultsEl.hidden = false;
    countEl.textContent = merged.length === 0
      ? "No entries recorded"
      : merged.length + (merged.length === 1 ? " entry" : " entries") + " · within " + radiusMiles + " mi of " + zip;
    if (merged.length === 0) { listEl.innerHTML = ""; return; }
    listEl.innerHTML = merged.map(function (m, i) {
      var meta = [];
      var cl = contactLine(m);
      if (cl) meta.push(cl);
      if (m.phone) meta.push('<a href="tel:' + esc(m.phone) + '">' + esc(m.phone) + "</a>");
      if (m.website) {
        var href = /^https?:\/\//i.test(m.website) ? m.website : "https://" + m.website;
        meta.push('<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">Website ↗</a>');
      }
      return '<div class="rf-item" data-index="' + i + '">' +
        '<span class="rf-item-idx">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<div class="rf-item-body">' +
        '<div class="rf-item-name">' + esc(m.name) + "</div>" +
        '<div class="rf-item-tags">' + catTags(m.categories, labels) + "</div>" +
        (meta.length ? '<div class="rf-item-meta">' + meta.join(" · ") + "</div>" : "") +
        "</div>" +
        '<span class="rf-item-dist">' + esc(distLine(m)) + "</span></div>";
    }).join("");
    Array.prototype.forEach.call(listEl.querySelectorAll(".rf-item"), function (el) {
      el.addEventListener("click", function (e) {
        // taps on phone/website links shouldn't pan the map
        if (e.target.closest && e.target.closest("a")) return;
        focusMarker(Number(el.getAttribute("data-index")));
      });
    });
  }

  function clearMarkers() {
    markers.forEach(function (mk) { mk.setMap(null); });
    markers = [];
    activeIdx = -1;
    if (originMarker) { originMarker.setMap(null); originMarker = null; }
    if (radiusCircle) { radiusCircle.setMap(null); radiusCircle = null; }
  }

  function renderMap(origin, merged, labels, radiusMiles) {
    var center = { lat: origin.lat, lng: origin.lng };
    if (!map) {
      map = new google.maps.Map(mapEl, {
        center: center, zoom: 11, mapTypeControl: false, streetViewControl: false,
        // no mapId here on purpose — adding one would silently disable `styles`
        styles: MAP_STYLE, backgroundColor: "#f1ede6",
        fullscreenControl: false, // the .hm-reveal ancestor's transform breaks the fullscreen containing block
        zoomControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM }, // chat widget owns bottom-right
      });
      infoWindow = new google.maps.InfoWindow();
    } else {
      map.setCenter(center);
    }
    clearMarkers();

    originMarker = new google.maps.Marker({
      position: center, map: map, title: "Search center (" + origin.zip + ")", zIndex: 9999,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#14213d", fillOpacity: 1, strokeColor: "#b4551f", strokeWeight: 2 },
    });
    radiusCircle = new google.maps.Circle({
      map: map, center: center, radius: radiusMiles * 1609.34,
      strokeColor: "#b4551f", strokeOpacity: 0.55, strokeWeight: 1.5, fillColor: "#b4551f", fillOpacity: 0.04,
    });

    var bounds = new google.maps.LatLngBounds();
    bounds.extend(center);
    merged.forEach(function (m, i) {
      var pos = { lat: m.lat, lng: m.lng };
      var marker = new google.maps.Marker({
        position: pos, map: map, title: m.name, icon: stationIcon(9),
        label: { text: String(i + 1), color: "#faf8f5", fontSize: "11px", fontWeight: "600" },
      });
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
    // sync the ledger row (marker clicks land here too)
    Array.prototype.forEach.call(listEl.querySelectorAll(".rf-item"), function (el, idx) {
      el.classList.toggle("active", idx === i);
    });
    // grow the active station; restore the previous one
    if (activeIdx !== i) {
      if (activeIdx >= 0 && markers[activeIdx]) {
        markers[activeIdx].setIcon(stationIcon(9));
        markers[activeIdx].setZIndex(1);
      }
      markers[i].setIcon(stationIcon(11));
      markers[i].setZIndex(1000);
      activeIdx = i;
    }
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
  var activeIdx = -1;

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
    merged.forEach(function (m) { m.dir = bearingDir(data.origin, m); });
    lastMerged = merged;
    lastLabels = labels;

    renderList(merged, labels, data.radiusMiles, data.origin.zip);

    var figEl = document.getElementById("rf-fig-caption");
    if (figEl) {
      figEl.textContent = "Fig. 01 — Survey of ZIP " + data.origin.zip + " · " + data.radiusMiles + " mi range";
    }

    return loadMaps().then(function () {
      renderMap(data.origin, merged, labels, data.radiusMiles);
      if (merged.length === 0) {
        showMsg("info", "Nothing charted within " + data.radiusMiles +
          " mi. Try a wider range or more categories.");
      }
    }).catch(function (err) {
      // The list still works without the map.
      mapEl.innerHTML = '<div class="rf-map-fallback">' +
        (err && err.message === "MAPS_NOT_CONFIGURED"
          ? "The map is not configured in this environment — every finding is logged in the field notes."
          : err && err.message === "MAPS_AUTH_FAILED"
            ? "The map key was rejected by Google — every finding is still available in the field notes."
            : "The map couldn't load right now — every finding is logged in the field notes.") + "</div>";
      if (merged.length === 0) {
        showMsg("info", "Nothing charted within " + data.radiusMiles + " mi.");
      }
    });
  }

  form.addEventListener("submit", onSubmit);
})();
