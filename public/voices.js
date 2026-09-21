/* HavenLink homepage "Voices" band: the testimonial carousel and the City of
   Orlando proclamation modal it opens. Shared behavior (nav state, reveals,
   count-up) lives in editorial.js; the hero canvas and the pinned "How It
   Works" driver live in home.js. Everything is null-checked - the SPA fallback
   can serve index.html on unexpected routes. */
(function () {
  "use strict";

  /* ============================================================
     Content. Appending an object here adds another voice - the cards
     are generated below, so no markup changes anywhere.

       type: "quote"     blockquote + attribution footer
       type: "coverage"  ink card: "In the news" tag + outlet link

     Quotes are reproduced verbatim, punctuation included.

     img paths point at /public/png/. A file that is missing or fails
     to load falls back to the initials plate, so an entry can ship
     before its artwork does.
     ============================================================ */

  var VOICES = [
    {
      type: "quote",
      quote: "The young residents behind HavenLink are active, engaged, and are already making a difference in our community. This is a great initiative, and I hope that their efforts continue to be so largely impactful!",
      name: "Buddy Dyer",
      title: "Mayor of Orlando",
      img: "/png/buddy-dyer.webp",
      initials: "BD",
      alt: "Buddy Dyer, Mayor of Orlando",
      action: { label: "Read the full proclamation", modal: "proclamation" }
    },
    {
      type: "coverage",
      tag: "In the news",
      copy: "See how Fox 35 covered HavenLink",
      linkLabel: "Watch the segment",
      icon: "play",
      href: "https://www.youtube.com/watch?v=U68DlX2NNAY",
      name: "Fox 35 Orlando",
      img: "/png/fox-35-logo.png",
      initials: "F35",
      alt: "Fox 35 Orlando"
    },
    {
      type: "quote",
      quote: "The students who built HavenLink researched a real problem in our community, families struggling to navigate adoption, and did something about it. That's the Florida grit I am proud of.",
      name: "Rick Scott",
      title: "United States Senator for Florida",
      img: "/png/rick-scott.webp",
      initials: "RS",
      alt: "Rick Scott, United States Senator for Florida"
    },
    {
      /* Temporarily off the carousel - kept here so it can be brought back by
         deleting the hidden flag. */
      hidden: true,
      type: "quote",
      quote: "HavenLink reflects Orlando's belief in being there for kids. I am glad Central Florida's high schoolers are doing such influential work!",
      name: "Maxwell Frost",
      title: "United States Representative for Central Florida",
      img: "/png/maxwell-frost.webp",
      initials: "MF",
      alt: "Maxwell Frost, United States Representative for Central Florida"
    },
    {
      type: "coverage",
      tag: "In the news",
      copy: "Central Florida students raise awareness for foster adoption",
      linkLabel: "Read the story",
      icon: "read",
      href: "https://mynews13.com/fl/orlando/news/2026/08/06/central-florida-students-raise-awareness-for-foster-adoption",
      name: "Spectrum News 13",
      img: "/png/spectrum-news-13-logo.png",
      initials: "S13",
      alt: "Spectrum News 13"
    },
    {
      type: "quote",
      quote: "The work that HavenLink does to support families and advocate for adoption is important in our community",
      name: "David Jolly",
      title: "Democratic Candidate for Florida Governor",
      img: "/png/david-jolly.png",
      initials: "DJ",
      alt: "David Jolly, Democratic candidate for Governor of Florida"
    },
    {
      type: "quote",
      quote: "I want to thank HavenLink for identifying a real gap in our community and building something to close it. I am looking forward to seeing how you grow this resource in the years to come.",
      name: "Megan Sladek",
      title: "Mayor of Oviedo",
      img: "/png/megan-sladek.webp",
      initials: "MS",
      alt: "Megan Sladek, Mayor of Oviedo",
      action: { label: "Read the full letter", modal: "letter-sladek" }
    },
    {
      type: "quote",
      quote: "The accomplishments of HavenLink are a remarkable example of what young people can achieve when they combine technology, empathy, entrepreneurship, and a genuine desire to serve their community.",
      name: "Tom Keen",
      title: "Orlando City Commissioner, District 1",
      img: "/png/tom-keen.png",
      initials: "TK",
      alt: "Tom Keen, Orlando City Commissioner for District 1",
      action: { label: "Read the full letter", modal: "letter-keen" }
    },
    {
      type: "coverage",
      tag: "In the news",
      copy: "Trinity Prep students build platform to help families navigate adoption",
      linkLabel: "Read the story",
      icon: "read",
      href: "https://www.wftv.com/news/local/trinity-prep-students-build-platform-help-families-navigate-adoption/3ABL6FXWDJCX3CD4FWV3VWMHNU/",
      name: "WFTV Channel 9",
      img: "/png/wftv-channel-9-logo.png",
      initials: "W9",
      alt: "WFTV Channel 9"
    },
    {
      type: "quote",
      quote: "The City of Orlando proudly recognizes the young leaders of HavenLink whose innovation, compassion, and civic engagement strengthen our community and inspire others to create meaningful solutions to complex challenges.",
      name: "Shan Rose",
      title: "Orlando City Commissioner",
      img: "/png/shan-rose.png",
      initials: "SR",
      alt: "Shan Rose, Orlando City Commissioner",
      action: { label: "Read the full proclamation", modal: "proclamation-rose" }
    },
    {
      type: "quote",
      quote: "I want to recognize HavenLink and its founders for outstanding youth civic innovation. Thank you for what you have done and continue to do for families in our community and beyond.",
      name: "Sheila DeCiccio",
      title: "Mayor of Winter Park",
      img: "/png/sheila-deciccio.png",
      initials: "SD",
      alt: "Sheila DeCiccio, Mayor of Winter Park"
    },
    {
      type: "quote",
      quote: "HavenLink's remarkable achievements in their local county demonstrate the power of young people to turn an idea into a meaningful reality. On behalf of the 1.6 million residents of Orange County, I thank you for the vital work you are doing.",
      name: "Jerry L. Demings",
      title: "Mayor of Orange County",
      img: "/png/jerry-demings.png",
      initials: "JD",
      alt: "Jerry L. Demings, Mayor of Orange County",
      action: { label: "Read the full letter", modal: "letter-demings" }
    },
    {
      type: "quote",
      quote: "After meeting with the HavenLink team, I would suggest for people in my district to use their great tool if they are looking to adopt!",
      name: "Carlos Guillermo Smith",
      title: "Florida State Senator, District 17",
      img: "/png/carlos-guillermo-smith.png",
      initials: "CS",
      alt: "Carlos Guillermo Smith, Florida State Senator for District 17"
    },
    {
      type: "quote",
      quote: "I was truly impressed by all the work HavenLink is doing. I advise my constituents to use this amazing tool.",
      name: "Anna V. Eskamani",
      title: ["Florida State Representative", "Orlando Mayor Candidate"],
      img: "/png/anna-eskamani.png",
      initials: "AE",
      alt: "Anna V. Eskamani, Florida State Representative and candidate for Mayor of Orlando"
    },
    {
      type: "quote",
      quote: "The work that HavenLink is doing is truly incredible, and we're looking forward to sharing it with our viewers.",
      name: "WESH 2",
      title: null,
      img: "/png/wesh-2-logo.png",
      initials: "W2",
      alt: "WESH 2"
    },
    {
      type: "quote",
      quote: "The free guidance HavenLink offers is extremely valuable to the families of Orange City. On behalf of the City Council, I hereby recognize HavenLink for their contributions to our community.",
      name: "Kelli Marks",
      title: "Mayor of Orange City",
      img: "/png/kelli-marks.png",
      initials: "KM",
      alt: "Kelli Marks, Mayor of Orange City",
      action: { label: "Read the full proclamation", modal: "proclamation-marks" }
    },
    {
      type: "quote",
      quote: "HavenLink is a great platform … It's the real element where people connect with people and with that you will get results",
      name: "Keith Truenow",
      title: "Florida State Senator, District 13",
      img: "/png/keith-truenow.png",
      initials: "KT",
      alt: "Keith Truenow, Florida State Senator for District 13"
    },
    {
      type: "quote",
      quote: "HavenLink is a wonderful platform",
      name: "LaVon Bracy Davis",
      title: "Florida State Senator, District 15",
      img: "/png/lavon-bracy-davis.png",
      initials: "LB",
      alt: "LaVon Bracy Davis, Florida State Senator for District 15"
    },
    {
      type: "quote",
      quote: "HavenLink is the kind of thing Florida needs. Initiatives like these are what will get us into the future.",
      name: "Emily Duda Buckley",
      title: "Nominee for Florida House",
      img: "/png/emily-duda-buckley.png",
      initials: "EB",
      alt: "Emily Duda Buckley, nominee for the Florida House"
    },
    {
      type: "quote",
      quote: "It's impressive to see how the HavenLink team have grown their project into an initiative that is raising awareness about adoption and helping connect families with licensed agencies.",
      name: "Youth Global Network",
      title: null,
      img: "/png/ygn-logo.png",
      initials: "YGN",
      alt: "Youth Global Network"
    },
    {
      type: "quote",
      quote: "A lot of times, others are challenged to understand how difficult the adoption process is, and the waiting times, and the costs. Platforms such as HavenLink are amazing in explaining the process and connections.",
      name: "Bonnie Hilton",
      title: "Utah Administrative Director, Hand in Hand",
      img: "/png/bonnie-hilton.webp",
      initials: "BH",
      alt: "Bonnie Hilton, Utah Administrative Director of Hand in Hand"
    },
    {
      type: "coverage",
      tag: "In the news",
      copy: "Finding support in the slow adoption process",
      linkLabel: "Read the story",
      icon: "read",
      href: "https://www.orlandosentinel.com/2026/07/22/commentary-finding-support-in-the-slow-adoption-process/",
      name: "Orlando Sentinel",
      img: "/png/orlando-sentinel-logo.png",
      initials: "OS",
      alt: "Orlando Sentinel"
    }
  ];

  var AVATAR = 60; /* must match --hl-avatar in home.css - reserves the box */
  var EAGER = 2; /* first two avatars load eagerly, the rest lazily */

  var strip = document.getElementById("voicesStrip");
  var track = document.getElementById("voicesTrack");
  if (!strip || !track) return;

  var viewport = track.parentNode;
  var railFill = document.querySelector(".hl-voices-rail-fill");
  var arrows = Array.prototype.slice.call(
    document.querySelectorAll("[data-voices-dir]")
  );

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReduced = reduceMotion.matches;
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function (e) {
      prefersReduced = e.matches;
    });
  }

  function scrollBehavior() {
    return prefersReduced ? "auto" : "smooth";
  }

  /* ---------- Card construction ---------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Initials plate sits underneath; the image is layered on top and removed
     if it 404s, so a broken-image icon can never appear. The wrapper is a
     fixed AVATAR square either way - no layout shift when real art lands.
     Once the real art paints the plate is dropped: several outlet logos ship
     on a transparent ground and would otherwise read their own initials
     through the mark. */
  function buildAvatar(voice, index) {
    var wrap = el("span", "hl-voice-avatar");
    var initials = el("span", "hl-voice-initials", voice.initials || "");
    initials.setAttribute("aria-hidden", "true");
    wrap.appendChild(initials);

    if (!voice.img) return wrap;

    function dropInitials() {
      if (initials.parentNode) initials.remove();
    }

    var img = el("img", "hl-voice-img");
    img.alt = voice.alt || voice.name;
    img.width = AVATAR;
    img.height = AVATAR;
    img.decoding = "async";
    if (index >= EAGER) img.loading = "lazy";
    img.addEventListener("error", function () {
      img.remove();
    });
    img.addEventListener("load", dropInitials);
    img.src = voice.img;
    /* a cached image can already be decoded before the listener above binds */
    if (img.complete && img.naturalWidth) dropInitials();
    wrap.appendChild(img);
    return wrap;
  }

  function buildAttrib(voice, index, tag) {
    var cap = el(tag, "hl-voice-attrib");
    cap.appendChild(buildAvatar(voice, index));
    var who = el("span", "hl-voice-who");
    who.appendChild(el("span", "hl-voice-name", voice.name));
    /* A title given as an array is set one line per entry - for the offices
       too long to sit on a single line under the name. */
    if (voice.title) {
      var role = el("span", "hl-voice-role");
      [].concat(voice.title).forEach(function (line, n) {
        if (n) role.appendChild(document.createElement("br"));
        role.appendChild(document.createTextNode(line));
      });
      who.appendChild(role);
    }
    cap.appendChild(who);
    return cap;
  }

  function buildQuoteCard(voice, index) {
    var card = el("li", "hl-voice hl-voice--quote");
    var fig = el("figure", "hl-voice-figure");

    var quote = el("blockquote", "hl-voice-quote");
    quote.appendChild(el("p", null, "“" + voice.quote + "”"));
    fig.appendChild(quote);

    /* An action either opens one of the document modals below (action.modal)
       or leaves for an outside page (action.href) - same treatment either way,
       a button or a link depending on what it actually does. */
    if (voice.action) {
      var act;
      if (voice.action.href) {
        act = el("a", "hl-voice-action");
        act.href = voice.action.href;
        act.target = "_blank";
        act.rel = "noopener noreferrer";
        act.setAttribute(
          "aria-label",
          voice.action.label + " about " + voice.name + " (opens in a new tab)"
        );
      } else {
        act = el("button", "hl-voice-action");
        act.type = "button";
        act.setAttribute("data-voice-modal", voice.action.modal);
      }
      act.appendChild(el("span", null, voice.action.label));
      var mark = el("span", "hl-voice-action-mark", "→");
      mark.setAttribute("aria-hidden", "true");
      act.appendChild(mark);
      fig.appendChild(act);
    }

    /* figcaption stays the last child of figure, as the spec requires */
    fig.appendChild(buildAttrib(voice, index, "figcaption"));
    card.appendChild(fig);
    return card;
  }

  function buildCoverageCard(voice, index) {
    var card = el("li", "hl-voice hl-voice--coverage hm-on-ink");

    card.appendChild(el("span", "hl-voice-tag", voice.tag || "In the news"));
    card.appendChild(el("p", "hl-voice-copy", voice.copy));

    var label = voice.linkLabel || "Watch the segment";
    var link = el("a", "hl-voice-link");
    link.href = voice.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute(
      "aria-label",
      label + " from " + voice.name + " (opens in a new tab)"
    );
    var glyph = el(
      "span",
      "hl-voice-glyph hl-voice-glyph--" + (voice.icon || "play")
    );
    glyph.setAttribute("aria-hidden", "true");
    link.appendChild(glyph);
    link.appendChild(el("span", null, label));
    card.appendChild(link);

    card.appendChild(buildAttrib(voice, index, "div"));
    return card;
  }

  /* An entry marked hidden:true keeps its content in VOICES but is not
     rendered; indices below are taken after the filter so lazy-loading and
     the --i stagger stay contiguous. */
  var VISIBLE = VOICES.filter(function (voice) {
    return !voice.hidden;
  });

  var frag = document.createDocumentFragment();
  VISIBLE.forEach(function (voice, i) {
    var card =
      voice.type === "coverage"
        ? buildCoverageCard(voice, i)
        : buildQuoteCard(voice, i);
    card.style.setProperty("--i", String(i));
    frag.appendChild(card);
  });
  strip.appendChild(frag);

  /* ---------- Scroll state: arrows, edge masks, progress rail ---------- */

  function cardStep() {
    var card = strip.firstElementChild;
    if (!card) return track.clientWidth;
    var gap = parseFloat(window.getComputedStyle(strip).columnGap) || 0;
    return card.getBoundingClientRect().width + gap;
  }

  function nudge(dir) {
    track.scrollBy({ left: dir * cardStep(), behavior: scrollBehavior() });
  }

  function sync() {
    var max = Math.max(track.scrollWidth - track.clientWidth, 0);
    var left = track.scrollLeft;
    /* 1px of slack: sub-pixel widths mean scrollLeft never lands on max */
    var atStart = left <= 1;
    var atEnd = left >= max - 1;
    var pos = max <= 1 ? "none" : atStart ? "start" : atEnd ? "end" : "mid";

    if (viewport && viewport.setAttribute) viewport.setAttribute("data-pos", pos);

    arrows.forEach(function (btn) {
      var dir = Number(btn.getAttribute("data-voices-dir")) || 1;
      btn.disabled = max <= 1 || (dir < 0 ? atStart : atEnd);
    });

    if (railFill) {
      var ratio = track.scrollWidth
        ? Math.min(1, track.clientWidth / track.scrollWidth)
        : 1;
      railFill.style.setProperty("--v-thumb", ratio.toFixed(4));
      railFill.style.setProperty("--v-pos", (max ? left / max : 0).toFixed(4));
    }
  }

  var syncQueued = false;
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(function () {
      syncQueued = false;
      sync();
    });
  }

  track.addEventListener("scroll", queueSync, { passive: true });
  window.addEventListener("resize", queueSync, { passive: true });
  window.addEventListener("load", queueSync);

  arrows.forEach(function (btn) {
    btn.addEventListener("click", function () {
      nudge(Number(btn.getAttribute("data-voices-dir")) || 1);
    });
  });

  track.addEventListener("keydown", function (e) {
    var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    nudge(dir);
  });

  sync();

  /* ---------- Reproduced-document modals ----------
     One shell, six documents: Mayor Dyer's letter of recognition,
     Commissioner Rose's HavenLink Week proclamation, Commissioner Keen's
     letter, Mayor Sladek's letter from the City of Oviedo, Mayor Marks'
     proclamation from the City of Orange City, and Mayor Demings' letter
     from Orange County. A card's
     data-voice-modal names which <article> to show; everything else - the
     focus trap, Escape, backdrop click, scroll lock - is shared, and each
     article supplies its own header strings via data-kicker/data-title.

     Only the Dyer letter has a PDF counterpart, so only it runs the probe
     below; the other five are always the typeset article. */

  var modal = document.getElementById("proclamationModal");
  var frame = document.getElementById("proclamationFrame");
  var letter = document.getElementById("proclamationLetter");
  var closeBtn = document.getElementById("proclamationClose");
  if (!modal) return;

  var docs = {
    proclamation: letter,
    "proclamation-rose": document.getElementById("proclamationRose"),
    "letter-keen": document.getElementById("letterKeen"),
    "letter-sladek": document.getElementById("letterSladek"),
    "letter-demings": document.getElementById("letterDemings"),
    "proclamation-marks": document.getElementById("proclamationMarks")
  };
  var kicker = document.getElementById("procKicker");
  var titleEl = document.getElementById("procTitle");

  var FOCUSABLE =
    'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
  var lastFocused = null;
  var closeTimer = null;
  // The PDF is not part of the deployed public asset set. Keep the typeset
  // letter as the authoritative document instead of probing a missing path
  // that the SPA fallback would answer with homepage HTML.
  var pdfAvailable = false;

  /* Show one document and hide the rest, then relabel the modal header from
     that document's own data- attributes. */
  function showDoc(key) {
    Object.keys(docs).forEach(function (k) {
      if (docs[k]) docs[k].hidden = k !== key;
    });
    var doc = docs[key];
    if (!doc) return;
    if (kicker) kicker.textContent = doc.getAttribute("data-kicker") || "";
    if (titleEl) titleEl.textContent = doc.getAttribute("data-title") || "";
    /* A document that is not City of Orlando paperwork can name its own accent,
       which re-points the shell's palette so the header band matches the sheet
       under it. No attribute means the default Orlando blue. */
    var accent = doc.getAttribute("data-accent");
    if (accent) modal.setAttribute("data-accent", accent);
    else modal.removeAttribute("data-accent");
  }

  function useLetter() {
    if (frame) frame.hidden = true;
    showDoc("proclamation");
  }

  function usePdf() {
    if (!frame) return useLetter();
    if (letter) letter.hidden = true;
    frame.hidden = false;
    var src = frame.getAttribute("data-src");
    if (src && !frame.getAttribute("src")) frame.setAttribute("src", src);
  }

  /* Empty placeholder art (a 0-byte signature or seal that hasn't landed yet)
     must never surface as a broken-image glyph: drop the <img> and let the
     wrapper hold its reserved space. Mirrors buildAvatar's handling above. */
  function guardDocImages() {
    modal.querySelectorAll(".hl-doc-img").forEach(function (img) {
      function drop() {
        /* read the parent BEFORE detaching - afterwards it is null */
        var box = img.parentNode;
        img.remove();
        if (box && box.classList) box.classList.add("is-empty");
      }
      if (img.complete && img.naturalWidth <= 1) drop();
      else {
        img.addEventListener("error", drop, { once: true });
        img.addEventListener("load", function () {
          if (img.naturalWidth <= 1) drop();
        }, { once: true });
      }
    });
  }
  guardDocImages();

  /* iOS and iPadOS render a PDF in an iframe as a dead grey panel, and an
     embedded viewer is unusable on a narrow screen - both read the typeset
     letter instead. */
  function pdfEmbedUnsupported() {
    var ua = window.navigator.userAgent || "";
    var iOS =
      /iP(hone|ad|od)/.test(ua) ||
      (/Mac/.test(ua) && window.navigator.maxTouchPoints > 1);
    return iOS || window.matchMedia("(max-width: 767px)").matches;
  }

  function resolveProclamation() {
    if (pdfEmbedUnsupported()) return useLetter();
    if (pdfAvailable === true) return usePdf();
    return useLetter();
  }

  function focusables() {
    return Array.prototype.slice
      .call(modal.querySelectorAll(FOCUSABLE))
      .filter(function (node) {
        return node.offsetParent !== null || node === closeBtn;
      });
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== "Tab") return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* Tab inside the embedded viewer is the iframe's own business, but focus
     must not be able to walk out the far side of it and back into the page. */
  function onFocusIn(e) {
    if (modal.hidden || modal.contains(e.target)) return;
    var items = focusables();
    (items[0] || closeBtn).focus();
  }

  function openModal(trigger, key) {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    lastFocused = trigger || document.activeElement;
    /* the letter may still be swapped for the PDF; the proclamation never is */
    if (key === "proclamation") resolveProclamation();
    else {
      if (frame) frame.hidden = true;
      showDoc(key);
    }
    modal.hidden = false;
    window.requestAnimationFrame(function () {
      modal.classList.add("is-open");
    });
    document.body.classList.add("proclamation-open");
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("focusin", onFocusIn);
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("proclamation-open");
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("focusin", onFocusIn);
    closeTimer = window.setTimeout(
      function () {
        modal.hidden = true;
        closeTimer = null;
      },
      prefersReduced ? 0 : 240
    );
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
    lastFocused = null;
  }

  strip.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-voice-modal]");
    if (!btn) return;
    var key = btn.getAttribute("data-voice-modal");
    if (docs[key]) openModal(btn, key);
  });

  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
})();
