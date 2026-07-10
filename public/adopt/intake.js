/**
 * HavenLink Family Intake — "The Dossier"
 * One continuous editorial document: declarative branching, per-keystroke
 * draft persistence (debounced, localStorage), chapter rail scroll-spy,
 * submit-time validation, and the same submission contract as before
 * (GET /auth/csrf → POST /api/intake-submission).
 *
 * PRIVACY: submission emails the answer set to HavenLink only. The account id
 * (the signed-in user's email) is attached server-side from the session.
 * Intake data is only shared with an AGENCY on an explicit, separate inquiry.
 */
(function () {
  'use strict';

  /* ---------- Static data ---------- */

  /* US states + DC, used for Q8 (residence) and Q30 (adoption state). */
  const US_STATES = [
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
    ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
    ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
    ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
    ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
    ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
    ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
    ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
    ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
    ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
    ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
    ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
    ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']
  ];

  const SECTIONS = ['household', 'lifestyle', 'experience', 'preferences', 'legal'];
  const STORAGE_KEY = 'havenlink_intake_v2';
  const LEGACY_KEY = 'havenlink_intake_form'; // wizard-era draft, same question keys
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- DOM read helpers ---------- */

  function getRadio(name) {
    const checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function getChecks(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked')).map(function (i) { return i.value; });
  }

  function getValue(name) {
    const el = document.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }

  function snapshot() {
    return {
      q03: getRadio('q03_has_children'),
      q08: getValue('q08_state'),
      q11: getRadio('q11_religion'),
      q13: getRadio('q13_has_pets'),
      q15: getChecks('q15_languages'),
      q16: getRadio('q16_prior_experience'),
      q20: getRadio('q20_cps_report'),
      q22: getChecks('q22_age_range'),
      q25: getChecks('q25_medical'),
      q26: getChecks('q26_behavioral'),
      q27: getRadio('q27_support_access'),
      q28: getRadio('q28_trauma_openness'),
      q30: getValue('q30_adoption_state'),
      q31: getRadio('q31_home_study'),
      q33: getRadio('q33_costs'),
      q34: getRadio('q34_background_checks'),
      q35: getRadio('q35_legal_rep')
    };
  }

  /* Q27 becomes required when higher-support needs are selected in Q25/Q26. */
  function q27Required(s) {
    const medicalHigh = s.q25.some(function (v) { return ['moderate', 'significant', 'any'].indexOf(v) !== -1; });
    const behavioralHigh = s.q26.some(function (v) { return ['developmental_delays', 'autism', 'trauma_ptsd', 'any'].indexOf(v) !== -1; });
    return medicalHigh || behavioralHigh;
  }

  /* ---------- Branching (declarative) ---------- */

  const RULES = [
    { target: 'br-q4', test: function (s) { return s.q03 === 'yes'; } },
    { target: 'br-q11', test: function (s) { return s.q11 === 'yes'; } },
    { target: 'br-q13', test: function (s) { return s.q13 === 'yes'; } },
    { target: 'br-q15', test: function (s) { return s.q15.indexOf('other') !== -1; } },
    { target: 'br-q17', test: function (s) { return s.q16 === 'foster' || s.q16 === 'adoption' || s.q16 === 'both'; } },
    { target: 'br-q20', test: function (s) { return s.q20 === 'yes'; } },
    { target: 'note-icpc', test: function (s) { return !!s.q08 && !!s.q30 && s.q08 !== s.q30; } },
    { target: 'note-teen', dismissible: true, test: function (s) { return s.q22.indexOf('teen') !== -1 && s.q28 === 'prefer_not'; } },
    { target: 'note-locator', test: function (s) { return q27Required(s) && s.q27 === 'limited'; } },
    { target: 'note-trauma', test: function (s) { return s.q26.indexOf('trauma_ptsd') !== -1 && s.q27 === 'limited'; } },
    { target: 'note-homestudy', test: function (s) { return s.q31 === 'unsure'; } },
    { target: 'note-financial', test: function (s) { return s.q33 === 'seeking_assistance'; } },
    { target: 'note-bgcheck', test: function (s) { return s.q34 === 'not_started'; } },
    { target: 'note-legalaid', test: function (s) { return s.q35 === 'unsure'; } }
  ];

  function setOpen(id, open) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('is-open', open);
    const inner = el.firstElementChild;
    if (inner) {
      // keep closed branches untabbable and hidden from AT (no display:none,
      // so the grid-rows unfold transition still runs)
      if (open) {
        inner.removeAttribute('inert');
        inner.removeAttribute('aria-hidden');
      } else {
        inner.setAttribute('inert', '');
        inner.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function applyRules() {
    const s = snapshot();
    RULES.forEach(function (rule) {
      setOpen(rule.target, !!rule.test(s) && !(rule.dismissible && dismissed.has(rule.target)));
    });

    // Q27 conditionally required: toggle the "required" tag + aria
    const req = q27Required(s);
    const tag = document.getElementById('q27_req');
    if (tag) tag.hidden = !req;
    const group = document.querySelector('[data-q="q27"] .q-options');
    if (group) group.setAttribute('aria-required', req ? 'true' : 'false');
  }

  function branchOpen(id) {
    const el = document.getElementById(id);
    return !!el && el.classList.contains('is-open');
  }

  /* ---------- Q4 child-age repeater ---------- */

  function collectAges() {
    return Array.from(document.querySelectorAll('input[name="q04_age_row"]')).map(function (i) { return i.value; });
  }

  function renderAgeRows() {
    const container = document.getElementById('q04_age_rows');
    const countField = document.getElementById('q04_child_count');
    if (!container || !countField) return;

    let count = parseInt(countField.value, 10);
    if (isNaN(count) || count < 0) count = 0;
    count = Math.min(count, 12);

    const existing = collectAges();
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('label');
      row.className = 'q-age';
      const label = document.createElement('span');
      label.className = 'q-age-label';
      label.textContent = 'Child ' + (i + 1);
      const input = document.createElement('input');
      input.type = 'number';
      input.id = 'q04_age_' + (i + 1);
      input.name = 'q04_age_row';
      input.className = 'q-writein q-writein--xs';
      input.min = '0';
      input.max = '17';
      input.step = '1';
      input.inputMode = 'numeric';
      input.setAttribute('aria-label', 'Age of child ' + (i + 1));
      if (existing[i] != null) input.value = existing[i];
      row.appendChild(label);
      row.appendChild(input);
      container.appendChild(row);
    }
  }

  /* ---------- Q30 mirrors Q8 until the user touches it ---------- */

  let q30Touched = false;

  function syncAdoptionState() {
    const q30 = document.getElementById('q30_adoption_state');
    const q8 = document.getElementById('q08_state');
    if (q30 && q8 && !q30Touched) q30.value = q8.value;
  }

  /* ---------- Draft persistence (localStorage, v2) ---------- */

  function emptyDraft() {
    return { v: 2, startedAt: new Date().toISOString(), savedAt: null, dismissed: [], answers: {} };
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.v === 2 && d.answers) return d;
      }
    } catch (e) { /* corrupted draft: start fresh */ }

    // One-time lift from the wizard-era draft — question keys are unchanged.
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw) {
        const old = JSON.parse(raw);
        localStorage.removeItem(LEGACY_KEY);
        if (old && typeof old === 'object') {
          const d = emptyDraft();
          if (typeof old.startedAt === 'string') d.startedAt = old.startedAt;
          SECTIONS.forEach(function (s) {
            if (old[s] && typeof old[s] === 'object') d.answers[s] = old[s];
          });
          if (Array.isArray(old.dismissedBanners) && old.dismissedBanners.indexOf('banner-teen') !== -1) {
            d.dismissed.push('note-teen');
          }
          // persist right away: the legacy key is already gone, so the
          // migrated draft must not depend on a later edit to survive
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (e2) { /* ignore */ }
          return d;
        }
      }
    } catch (e) { /* ignore */ }

    return emptyDraft();
  }

  /* Collect one chapter's answers from the live DOM.
     prune=true (submission): drop fields inside closed branches and empties.
     prune=false (draft): keep everything so reopening a branch restores it. */
  function collectSection(section, prune) {
    const chapter = document.getElementById('chapter-' + section);
    const data = {};
    if (!chapter) return data;

    const seen = new Set();
    chapter.querySelectorAll('[name]').forEach(function (el) {
      const name = el.name;
      if (!name || seen.has(name)) return;
      if (prune) {
        const branch = el.closest('.q-branch');
        if (branch && !branch.classList.contains('is-open')) return;
      }
      seen.add(name);

      if (el.type === 'radio') {
        const checked = chapter.querySelector('input[name="' + name + '"]:checked');
        if (checked) data[name] = checked.value;
        else if (!prune) data[name] = null;
      } else if (el.type === 'checkbox') {
        const vals = Array.from(chapter.querySelectorAll('input[name="' + name + '"]:checked')).map(function (i) { return i.value; });
        if (vals.length || !prune) data[name] = vals;
      } else if (name === 'q04_age_row') {
        const ages = collectAges();
        if (ages.length || !prune) data.q04_ages = ages;
      } else {
        if (el.value !== '' || !prune) data[name] = el.value;
      }
    });
    return data;
  }

  let draft = loadDraft();
  const dismissed = new Set(draft.dismissed || []);

  function saveDraft() {
    SECTIONS.forEach(function (s) { draft.answers[s] = collectSection(s, false); });
    draft.dismissed = Array.from(dismissed);
    draft.savedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      console.error('Failed to save intake draft:', e);
    }
  }

  let saveTimer = null;
  function saveDraftSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 400);
  }

  function restore() {
    SECTIONS.forEach(function (section) {
      const data = draft.answers[section];
      if (!data) return;
      Object.keys(data).forEach(function (name) {
        if (name === 'q04_ages') return; // rebuilt after the count restores
        const value = data[name];
        const els = document.querySelectorAll('[name="' + name + '"]');
        if (!els.length) return;
        if (els[0].type === 'radio') {
          els.forEach(function (el) { el.checked = (el.value === value); });
        } else if (els[0].type === 'checkbox') {
          const arr = Array.isArray(value) ? value : [];
          els.forEach(function (el) { el.checked = arr.indexOf(el.value) !== -1; });
        } else {
          els[0].value = value == null ? '' : value;
        }
      });
    });

    // A stored Q30 counts as a manual override — stop mirroring Q8.
    if (draft.answers.legal && draft.answers.legal.q30_adoption_state) q30Touched = true;

    renderAgeRows();
    const ages = (draft.answers.household && draft.answers.household.q04_ages) || [];
    document.querySelectorAll('input[name="q04_age_row"]').forEach(function (el, i) {
      if (ages[i] != null) el.value = ages[i];
    });
  }

  /* ---------- Progress (rail counts + honest percentage) ---------- */

  const radio = function (name) { return function () { return !!getRadio(name); }; };
  const checks = function (name) { return function () { return getChecks(name).length > 0; }; };
  const value = function (name) { return function () { return getValue(name).trim() !== ''; }; };
  const Q = function (section, done, branch) { return { section: section, done: done, branch: branch }; };

  /* The 35 numbered entries. `branch` marks the questions that only exist
     while their .q-branch is open (Q4, Q17); those adjust the denominator. */
  const QUESTIONS = [
    Q('household', value('q01_adults')),
    Q('household', radio('q02_relationship')),
    Q('household', radio('q03_has_children')),
    Q('household', value('q04_child_count'), 'br-q4'),
    Q('household', radio('q05_home_type')),
    Q('household', radio('q06_own_rent')),
    Q('household', radio('q07_bedrooms')),
    Q('household', value('q08_state')),
    Q('household', radio('q09_income')),
    Q('lifestyle', radio('q10_activity')),
    Q('lifestyle', radio('q11_religion')),
    Q('lifestyle', radio('q12_cultural_openness')),
    Q('lifestyle', radio('q13_has_pets')),
    Q('lifestyle', radio('q14_weekday')),
    Q('lifestyle', checks('q15_languages')),
    Q('experience', radio('q16_prior_experience')),
    Q('experience', function () {
      return getValue('q17_placement_count').trim() !== '' || getChecks('q17_age_ranges').length > 0;
    }, 'br-q17'),
    Q('experience', radio('q18_professional_exp')),
    Q('experience', radio('q19_training')),
    Q('experience', radio('q20_cps_report')),
    Q('experience', radio('q21_references')),
    Q('preferences', checks('q22_age_range')),
    Q('preferences', radio('q23_siblings')),
    Q('preferences', radio('q24_gender_pref')),
    Q('preferences', checks('q25_medical')),
    Q('preferences', checks('q26_behavioral')),
    Q('preferences', radio('q27_support_access')),
    Q('preferences', radio('q28_trauma_openness')),
    Q('preferences', radio('q29_birth_family_contact')),
    Q('legal', value('q30_adoption_state')),
    Q('legal', radio('q31_home_study')),
    Q('legal', radio('q32_attorney_agency')),
    Q('legal', radio('q33_costs')),
    Q('legal', radio('q34_background_checks')),
    Q('legal', radio('q35_legal_rep'))
  ];

  function updateProgress() {
    const per = {};
    SECTIONS.forEach(function (s) { per[s] = { total: 0, done: 0 }; });

    QUESTIONS.forEach(function (q) {
      if (q.branch && !branchOpen(q.branch)) return; // question not currently asked
      per[q.section].total += 1;
      if (q.done()) per[q.section].done += 1;
    });

    let total = 0;
    let done = 0;
    SECTIONS.forEach(function (s) {
      total += per[s].total;
      done += per[s].done;
      const badge = document.querySelector('.ik-rail-count[data-count="' + s + '"]');
      if (badge) badge.textContent = per[s].done + '/' + per[s].total;
      const item = document.querySelector('.ik-rail-item[data-section="' + s + '"]');
      if (item) item.classList.toggle('is-done', per[s].total > 0 && per[s].done === per[s].total);
    });

    const pct = total ? Math.round((done / total) * 100) : 0;
    const pctEl = document.getElementById('ikPercent');
    if (pctEl) pctEl.textContent = String(pct);
    const fill = document.getElementById('ikMeterFill');
    if (fill) fill.style.width = pct + '%';
  }

  /* ---------- Chapter rail scroll-spy ---------- */

  function setCurrentChapter(section) {
    document.querySelectorAll('.ik-rail-item').forEach(function (item) {
      item.classList.toggle('is-current', item.dataset.section === section);
    });
  }

  function setupScrollSpy() {
    setCurrentChapter('household');
    if (!('IntersectionObserver' in window)) return;
    const spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setCurrentChapter(entry.target.dataset.section);
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    document.querySelectorAll('.ik-chapter').forEach(function (chapter) { spy.observe(chapter); });
  }

  /* ---------- Validation (submit-time) ---------- */

  const REQUIRED = [
    { entry: 'q01', check: function () { const v = getValue('q01_adults').trim(); const n = Number(v); return v !== '' && n >= 1 && n <= 10; } },
    { entry: 'q02', check: function () { return !!getRadio('q02_relationship'); } },
    { entry: 'q05', check: function () { return !!getRadio('q05_home_type'); } },
    { entry: 'q08', check: function () { return !!getValue('q08_state'); } },
    { entry: 'q22', check: function () { return getChecks('q22_age_range').length > 0; } },
    { entry: 'q30', check: function () { return !!getValue('q30_adoption_state'); } },
    { entry: 'q31', check: function () { return !!getRadio('q31_home_study'); } },
    { entry: 'q34', check: function () { return !!getRadio('q34_background_checks'); } }
  ];

  function clearErrors() {
    document.querySelectorAll('.q-entry.has-error').forEach(function (el) { el.classList.remove('has-error'); });
    document.querySelectorAll('.q-error.show').forEach(function (el) { el.classList.remove('show'); });
  }

  function validate() {
    clearErrors();
    const failures = [];

    REQUIRED.forEach(function (r) {
      if (!r.check()) failures.push({ entry: r.entry, errorId: r.entry + '_error' });
    });

    const s = snapshot();
    if (s.q20 === 'yes' && getValue('q20_explanation').trim() === '') {
      failures.push({ entry: 'q20', errorId: 'q20_explanation_error', focusId: 'q20_explanation' });
    }
    if (q27Required(s) && !s.q27) {
      failures.push({ entry: 'q27', errorId: 'q27_error' });
    }

    if (!failures.length) return true;

    failures.forEach(function (f) {
      const entry = document.querySelector('.q-entry[data-q="' + f.entry + '"]');
      if (entry) entry.classList.add('has-error');
      const err = document.getElementById(f.errorId);
      if (err) err.classList.add('show');
    });

    const first = failures[0];
    const entry = document.querySelector('.q-entry[data-q="' + first.entry + '"]');
    if (entry) {
      const smooth = !(REDUCED_MOTION && REDUCED_MOTION.matches);
      entry.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      const focusTarget = first.focusId
        ? document.getElementById(first.focusId)
        : entry.querySelector('input, select, textarea');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
    return false;
  }

  /* ---------- Submission ---------- */

  async function submitDossier() {
    if (!validate()) return;
    saveDraft();

    const btn = document.getElementById('ikFileBtn');
    const errEl = document.getElementById('ikSubmitError');
    const originalLabel = btn ? btn.innerHTML : '';
    if (errEl) errEl.hidden = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Filing…';
    }

    try {
      // Same double-submit CSRF pattern as account.js: fetch the token, echo
      // it in the x-csrf-token header (the cookie half is httpOnly).
      const csrfRes = await fetch('/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
      if (!csrfRes.ok) throw new Error('Could not get CSRF token');
      const csrfData = await csrfRes.json();

      // Answers inside closed branches never leave the device.
      const payload = { startedAt: draft.startedAt };
      SECTIONS.forEach(function (s) { payload[s] = collectSection(s, true); });

      const res = await fetch('/api/intake-submission', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfData.csrfToken
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Submission failed (' + res.status + ')');

      draft.submittedAt = new Date().toISOString();
      saveDraft();
      showFiled();
    } catch (e) {
      console.error('Intake submission failed:', e);
      if (errEl) errEl.hidden = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    }
  }

  function showFiled() {
    const overlay = document.getElementById('intakeComplete');
    if (!overlay) {
      window.location.href = '/adopt/agency-profiles';
      return;
    }
    const dateEl = document.getElementById('ikFiledDate');
    if (dateEl) dateEl.textContent = longDate(new Date());
    overlay.removeAttribute('aria-hidden');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const cta = overlay.querySelector('a, button');
    if (cta) cta.focus();
  }

  /* ---------- Cover (applicant line, dates, stamp) ---------- */

  function longDate(d) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function stampDate(d) {
    const day = String(d.getDate()).padStart(2, '0');
    return MONTHS[d.getMonth()] + ' ' + day + ' ' + d.getFullYear();
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function bootCover() {
    const now = new Date();
    setText('ikOpened', longDate(now));
    setText('ikStampDate', stampDate(now));

    fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        const email = data && data.user && data.user.email;
        setText('ikApplicant', email || 'Your account');
        setText('ikSignEmail', email || 'your account');
      })
      .catch(function () {
        setText('ikApplicant', 'Your account');
      });

    const cover = document.querySelector('.ik-cover');
    if (cover) {
      if (REDUCED_MOTION && REDUCED_MOTION.matches) {
        cover.classList.add('is-stamped');
      } else {
        setTimeout(function () { cover.classList.add('is-stamped'); }, 650);
      }
    }
  }

  /* ---------- Event wiring + init ---------- */

  function onFieldChange(e) {
    const t = e.target;
    if (!t || !t.name) return;

    // touching a question clears its validation state
    const entry = t.closest('.q-entry');
    if (entry && entry.classList.contains('has-error')) {
      entry.classList.remove('has-error');
      entry.querySelectorAll('.q-error.show').forEach(function (el) { el.classList.remove('show'); });
    }

    if (t.name === 'q08_state') syncAdoptionState();
    if (t.name === 'q30_adoption_state') q30Touched = true;

    applyRules();
    updateProgress();
    saveDraftSoon();
  }

  function populateStates() {
    ['q08_state', 'q30_adoption_state'].forEach(function (id) {
      const select = document.getElementById(id);
      if (!select) return;
      US_STATES.forEach(function (pair) {
        const opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        select.appendChild(opt);
      });
    });
  }

  /* The adopt subnav is ~52px on desktop but ~85px on mobile (numeral +
     label stack). The rail's sticky offset and all scroll-margins read the
     measured height from --ik-subnav-h. */
  function syncSubnavHeight() {
    const subnav = document.getElementById('adoptSubnav');
    if (subnav) {
      document.documentElement.style.setProperty('--ik-subnav-h', subnav.offsetHeight + 'px');
    }
  }

  function init() {
    const form = document.getElementById('intakeForm');
    if (!form) return;

    syncSubnavHeight();
    window.addEventListener('resize', syncSubnavHeight);

    populateStates();
    restore();
    syncAdoptionState();
    applyRules();
    updateProgress();
    setupScrollSpy();
    bootCover();

    const overlay = document.getElementById('intakeComplete');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');

    form.addEventListener('change', onFieldChange);
    form.addEventListener('input', function (e) {
      if (e.target && e.target.name === 'q04_child_count') renderAgeRows();
      onFieldChange(e);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitDossier();
    });

    document.querySelectorAll('.ik-note-dismiss').forEach(function (btn) {
      btn.addEventListener('click', function () {
        dismissed.add(btn.dataset.dismiss);
        applyRules();
        saveDraft();
      });
    });

    // auto-save makes a beforeunload prompt unnecessary; just flush the timer
    window.addEventListener('pagehide', saveDraft);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveDraft();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
