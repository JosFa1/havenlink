// Adopt flow script: subnav, wizard, branching, storage, scoring
(function () {
  const STORAGE_KEY = 'havenlink_family_intake';
  const form = document.getElementById('familyIntakeForm');
  const steps = Array.from(document.querySelectorAll('.wizard-step'));
  const progressBar = document.getElementById('wizardProgress');
  let currentStep = 1;

  function showStep(n) {
    steps.forEach(s => s.classList.remove('active'));
    const stepEl = document.querySelector(`.wizard-step[data-step="${n}"]`);
    if (stepEl) stepEl.classList.add('active');
    currentStep = n;
    updateProgress();
    document.getElementById('btnBack').style.display = (n === 1) ? 'none' : 'inline-block';
    document.getElementById('btnNext').style.display = (n === steps.length) ? 'none' : 'inline-block';
    document.getElementById('btnSubmit').style.display = (n === steps.length) ? 'inline-block' : 'none';
  }

  function updateProgress() {
    const percent = Math.round(((currentStep - 1) / (steps.length - 1)) * 100);
    if (progressBar) progressBar.style.width = percent + '%';
  }

  function validateStep(n) {
    const stepEl = document.querySelector(`.wizard-step[data-step="${n}"]`);
    if (!stepEl) return true;
    const requiredFields = stepEl.querySelectorAll('[required]');
    for (const field of requiredFields) {
      if (!field.value || String(field.value).trim() === '') {
        field.focus();
        return false;
      }
    }
    return true;
  }

  function saveState() {
    if (!form) return {};
    const data = {};
    const fd = new FormData(form);
    for (const [key, value] of fd.entries()) {
      if (data[key] !== undefined) {
        if (!Array.isArray(data[key])) data[key] = [data[key]];
        data[key].push(value);
      } else {
        data[key] = value;
      }
    }

    // capture checkbox groups that may not be in FormData if unchecked
    // capture dynamic child ages
    const q4ages = [];
    document.querySelectorAll('#q4_ages input[data-child-age]').forEach(i => q4ages.push(i.value));
    if (q4ages.length) data.q4_ages = q4ages;

    const q17ages = [];
    document.querySelectorAll('#q17_ages_container input[data-placement-age]').forEach(i => q17ages.push(i.value));
    if (q17ages.length) data.q17_ages = q17ages;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (typeof announceNavigation === 'function') announceNavigation('Saved locally');
    return data;
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !form) return;
    const data = JSON.parse(raw);
    for (const key in data) {
      const val = data[key];
      const els = form.elements[key];
      if (!els) continue;
      if (els.length) {
        // radio/checkbox groups
        for (const el of els) {
          if (Array.isArray(val)) {
            el.checked = val.includes(el.value);
          } else {
            if (el.type === 'radio') el.checked = el.value === val;
            if (el.type === 'checkbox') el.checked = (el.value === val) || (Array.isArray(val) && val.includes(el.value));
          }
        }
      } else {
        if (els.type === 'checkbox' || els.type === 'radio') {
          els.checked = Boolean(val);
        } else {
          els.value = val;
        }
      }
    }
    // dynamic ages
    if (data.q4_ages) {
      document.getElementById('q4_count').value = data.q4_ages.length;
      generateChildAgeInputs(data.q4_ages.length, data.q4_ages);
      document.getElementById('q4_container').style.display = 'block';
    }
    if (data.q17_ages) {
      document.getElementById('q17_count').value = data.q17_ages.length;
      generatePlacementAgeInputs(data.q17_ages.length, data.q17_ages);
      document.getElementById('q17_container').style.display = 'block';
    }
    triggerConditionalUI();
  }

  // dynamic child ages fields
  function generateChildAgeInputs(count, values) {
    const container = document.getElementById('q4_ages');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.gap = '0.5rem';
      const label = document.createElement('label');
      label.textContent = `Child ${i + 1} age:`;
      label.style.minWidth = '120px';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '25';
      input.className = 'input';
      input.setAttribute('data-child-age', '');
      input.value = (values && values[i]) ? values[i] : '';
      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);
    }
  }

  function generatePlacementAgeInputs(count, values) {
    const container = document.getElementById('q17_ages_container');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.gap = '0.5rem';
      const label = document.createElement('label');
      label.textContent = `Placement ${i + 1} age range:`;
      label.style.minWidth = '160px';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input';
      input.setAttribute('data-placement-age', '');
      input.placeholder = 'e.g. 2-5';
      input.value = (values && values[i]) ? values[i] : '';
      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);
    }
  }

  // branching and UI triggers
  function triggerConditionalUI() {
    // Q3 -> Q4
    const q3 = form.querySelector('input[name="q3"]:checked');
    const q4_container = document.getElementById('q4_container');
    if (q3 && q3.value === 'yes') {
      q4_container.style.display = 'block';
    } else {
      // keep values but hide
      q4_container.style.display = 'none';
    }

    // Q11 affiliation
    const q11 = document.getElementById('q11');
    const q11_specify = document.getElementById('q11_specify');
    if (q11 && q11.value === 'yes') q11_specify.style.display = 'block'; else q11_specify.style.display = 'none';

    // Q13 pets
    const q13 = form.querySelector('input[name="q13"]:checked');
    const q13_pets = document.getElementById('q13_pets');
    if (q13 && q13.value === 'yes') q13_pets.style.display = 'block'; else q13_pets.style.display = 'none';

    // Q16 -> Q17
    const q16 = document.getElementById('q16');
    const q17c = document.getElementById('q17_container');
    if (q16 && q16.value && q16.value !== 'No') q17c.style.display = 'block'; else q17c.style.display = 'none';

    // Q20 -> explanation
    const q20 = form.querySelector('input[name="q20"]:checked');
    const q20ex = document.getElementById('q20_explain');
    if (q20 && q20.value === 'yes') q20ex.style.display = 'block'; else q20ex.style.display = 'none';

    // Q31 -> primer
    const q31 = document.getElementById('q31');
    const q31card = document.getElementById('q31_explain_card');
    if (q31 && q31.value === 'Unsure what this is') q31card.style.display = 'block'; else q31card.style.display = 'none';

    // Q15 other languages
    const q15others = Array.from(document.querySelectorAll('input[name="q15_lang"]')).find(i => i.value === 'Other');
    const q15_other_div = document.getElementById('q15_other');
    if (q15others && q15others.checked) q15_other_div.style.display = 'block'; else q15_other_div.style.display = 'none';
  }

  // attach listeners to trigger branch UI
  function attachBranchListeners() {
    // q3 radios
    form.querySelectorAll('input[name="q3"]').forEach(r => r.addEventListener('change', triggerConditionalUI));
    // q4 count
    const q4count = document.getElementById('q4_count');
    if (q4count) q4count.addEventListener('change', (e) => {
      const n = parseInt(e.target.value, 10) || 0;
      generateChildAgeInputs(n);
    });
    // q11
    const q11 = document.getElementById('q11'); if (q11) q11.addEventListener('change', triggerConditionalUI);
    // q13
    form.querySelectorAll('input[name="q13"]').forEach(r => r.addEventListener('change', triggerConditionalUI));
    // q16
    const q16 = document.getElementById('q16'); if (q16) q16.addEventListener('change', triggerConditionalUI);
    // q17 count
    const q17count = document.getElementById('q17_count'); if (q17count) q17count.addEventListener('change', (e) => {
      const n = parseInt(e.target.value, 10) || 0; generatePlacementAgeInputs(n);
    });
    // q20
    form.querySelectorAll('input[name="q20"]').forEach(r => r.addEventListener('change', triggerConditionalUI));
    // q31
    const q31 = document.getElementById('q31'); if (q31) q31.addEventListener('change', triggerConditionalUI);
    // q15 others
    form.querySelectorAll('input[name="q15_lang"]').forEach(c => c.addEventListener('change', triggerConditionalUI));
  }

  // compute deterministic scoring and outputs
  function computeResults(data) {
    // Routing
    const residence = data.q8 || '';
    const adoptState = data.q30 || residence;
    const icpc = (residence && adoptState && residence !== adoptState);

    // Age recommendation
    const q22 = data.q22;
    let recommendedAge = 'Not specified';
    if (!q22) {
      recommendedAge = 'Please specify age preferences';
    } else if (Array.isArray(q22) && q22.includes('Any') || (typeof q22 === 'string' && q22 === 'Any')) {
      recommendedAge = 'Open to any age';
    } else {
      const selected = Array.isArray(q22) ? q22 : [q22];
      recommendedAge = selected.join(', ');
    }

    // Scoring: weights
    const weights = { age: 25, special: 20, sibling: 10, trauma: 15, gender: 5, birth: 5, experience: 20 };

    // ageScore (0-25)
    let ageScoreRaw = 12;
    const ageMap = { 'Infant': 20, 'Toddler': 20, 'School': 18, 'Preteen': 14, 'Teen': 12, 'Any': 25 };
    if (data.q22) {
      const picks = Array.isArray(data.q22) ? data.q22 : [data.q22];
      if (picks.includes('Any')) ageScoreRaw = ageMap['Any'];
      else {
        let best = 0;
        picks.forEach(p => { for (const key in ageMap) { if (p.indexOf(key) !== -1 && ageMap[key] > best) best = ageMap[key]; } });
        if (best) ageScoreRaw = best;
      }
    }

    // special needs alignment (Q25 & Q26 combined) (0-20)
    let specialRaw = 8;
    const q25 = Array.isArray(data.q25) ? data.q25 : (data.q25 ? [data.q25] : []);
    const q26 = Array.isArray(data.q26) ? data.q26 : (data.q26 ? [data.q26] : []);
    if (q25.includes('Open') || q26.includes('Open')) specialRaw = 20;
    else if (q25.includes('Significant') || q26.includes('Trauma')) specialRaw = 16;
    else if (q25.includes('Moderate') || q26.includes('Developmental')) specialRaw = 12;
    else if (q25.includes('Minor') || q26.includes('ADHD')) specialRaw = 10;

    // sibling openness (0-10)
    let siblingRaw = 5;
    if (data.q23) {
      if (data.q23.indexOf('any') !== -1) siblingRaw = 10;
      else if (data.q23.indexOf('up to 2') !== -1) siblingRaw = 8;
      else if (data.q23.indexOf('Prefer single') !== -1) siblingRaw = 2;
      else siblingRaw = 5;
    }

    // trauma readiness (0-15)
    let traumaRaw = 5;
    if (data.q28) {
      if (data.q28.indexOf('training') !== -1) traumaRaw = 15;
      else if (data.q28.indexOf('willing') !== -1) traumaRaw = 10;
      else if (data.q28.indexOf('Prefer not') !== -1) traumaRaw = 0;
      else traumaRaw = 5;
    }

    // gender (0-5)
    const genderRaw = (data.q24 && data.q24.indexOf('No preference') !== -1) ? 5 : 3;

    // birth family (0-5)
    const birthRaw = (data.q29 && data.q29.indexOf('Yes') !== -1) ? 5 : 3;

    // experience bonus (0-20)
    let expRaw = 0;
    if (data.q16) {
      if (data.q16.indexOf('both') !== -1) expRaw = 20;
      else if (data.q16.indexOf('adoption') !== -1 || data.q16.indexOf('foster') !== -1) expRaw = 15;
    }

    // normalize and compute weighted sum
    const ageNorm = Math.max(0, Math.min(1, ageScoreRaw / 25));
    const specialNorm = Math.max(0, Math.min(1, specialRaw / 20));
    const siblingNorm = Math.max(0, Math.min(1, siblingRaw / 10));
    const traumaNorm = Math.max(0, Math.min(1, traumaRaw / 15));
    const genderNorm = Math.max(0, Math.min(1, genderRaw / 5));
    const birthNorm = Math.max(0, Math.min(1, birthRaw / 5));
    const expNorm = Math.max(0, Math.min(1, expRaw / 20));

    const total = Math.round(
      ageNorm * weights.age +
      specialNorm * weights.special +
      siblingNorm * weights.sibling +
      traumaNorm * weights.trauma +
      genderNorm * weights.gender +
      birthNorm * weights.birth +
      expNorm * weights.experience
    );

    // readiness stage
    let readiness = 'Exploring';
    if ((data.q31 && data.q31.indexOf('completed') !== -1) && (data.q34 && data.q34.indexOf('Yes') !== -1)) readiness = 'Active';
    else if ((data.q31 && data.q31.indexOf('in progress') !== -1) || (data.q34 && data.q34.indexOf('In progress') !== -1) || (data.q32 && data.q32.indexOf('Yes') !== -1)) readiness = 'Preparing';

    // flags
    const flags = [];
    if (data.q33 && data.q33.indexOf('assistance') !== -1) flags.push('Financial assistance likely needed');
    if (data.q20 && data.q20 === 'yes') flags.push('CPS report — routing and support recommended');
    if ((q25.includes('Significant') || q26.includes('Trauma') || q26.includes('Autism')) && data.q27 && data.q27.indexOf('Limited access') !== -1) flags.push('Therapeutic support gap in your area');
    if (data.q15 && (Array.isArray(data.q15_lang) || data.q15_lang)) {
      const langs = Array.isArray(data.q15_lang) ? data.q15_lang.join(', ') : (data.q15_lang || 'English');
      if (langs && langs !== 'English') flags.push('Multilingual match available: ' + langs);
    }

    // breakdown
    const breakdown = {
      age: Math.round(ageNorm * weights.age),
      special: Math.round(specialNorm * weights.special),
      sibling: Math.round(siblingNorm * weights.sibling),
      trauma: Math.round(traumaNorm * weights.trauma),
      gender: Math.round(genderNorm * weights.gender),
      birth: Math.round(birthNorm * weights.birth),
      experience: Math.round(expNorm * weights.experience)
    };

    return {
      routing: icpc ? `ICPC required — interstate routing recommended (residence ${residence} → adoption ${adoptState})` : `In-state agencies recommended (${residence || adoptState})`,
      recommendedAge,
      score: total,
      readiness,
      flags,
      breakdown
    };
  }

  function renderResults(res) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    if (!panel || !content) return;
    panel.style.display = 'block';
    content.innerHTML = '';
    const html = [];
    html.push(`<div style=\"display:flex;gap:1rem;align-items:center;\"><div class=\"score-circle\">${res.score}</div><div><strong>Match Strength</strong><p class=\"inline-help\">Score: ${res.score} — ${res.readiness}</p></div></div>`);
    html.push(`<h3 style=\"margin-top:1rem;\">Recommended Routing</h3><p class=\"inline-help\">${res.routing}</p>`);
    html.push(`<h3>Recommended Age Range</h3><p class=\"inline-help\">${res.recommendedAge}</p>`);
    html.push(`<h3>Flags & Notes</h3><ul>${res.flags.map(f => `<li>${f}</li>`).join('') || '<li>None</li>'}</ul>`);
    html.push(`<h3>Scoring Breakdown</h3><ul>`);
    for (const k in res.breakdown) html.push(`<li><strong>${k}:</strong> ${res.breakdown[k]} pts</li>`);
    html.push(`</ul>`);
    content.innerHTML = html.join('\n');
  }

  function computeAndShowResults() {
    const data = saveState();
    const res = computeResults(data);
    renderResults(res);
    const panel = document.getElementById('resultsPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
  }

  // wire up navigation
  document.getElementById('btnNext').addEventListener('click', () => {
    if (!validateStep(currentStep)) return;
    showStep(Math.min(steps.length, currentStep + 1));
    saveState();
  });
  document.getElementById('btnBack').addEventListener('click', () => showStep(Math.max(1, currentStep - 1)));
  document.getElementById('btnSave').addEventListener('click', () => saveState());
  form.addEventListener('submit', (e) => { e.preventDefault(); if (!validateStep(currentStep)) return; computeAndShowResults(); });

  // initialize
  showStep(1);
  attachBranchListeners();
  loadState();

  // subnav active link highlight
  (function highlightSubnav(){
    const path = window.location.pathname;
    document.querySelectorAll('.adopt-steps a').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('.adopt-steps a').forEach(a => {
      if (path.indexOf(a.getAttribute('href')) !== -1 || path.endsWith(a.getAttribute('href'))) {
        a.classList.add('active');
      }
    });
  })();

})();
