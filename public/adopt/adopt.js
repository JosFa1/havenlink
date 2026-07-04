/**
 * HavenLink Intake Form State Management
 * Handles form navigation, state persistence, branching, validation, and progress.
 *
 * Persistence model: answers live in memory and are written to localStorage only on
 * explicit "Save & Continue" or when a section is completed (advancing) — never on
 * every keystroke. Conditional logic reads the live DOM so branches react instantly,
 * but nothing is persisted until a section boundary.
 */

const INTAKE_BACKEND_DISABLED = true;
const INTAKE_BACKEND_DISABLED_MESSAGE =
  'Online submissions are temporarily paused while HavenLink reduces hosting costs. Please email havenlink.org@gmail.com and we will follow up directly.';

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

/* Required fields per section (block forward advancement when invalid). */
const REQUIRED_FIELDS = {
  household: ['q01_adults', 'q02_relationship', 'q05_home_type', 'q08_state'],
  lifestyle: [],
  experience: [],
  preferences: ['q22_age_range'], // q27_support_access is conditionally required (see isQ27Required)
  legal: ['q30_adoption_state', 'q31_home_study', 'q34_background_checks']
};

class IntakeFormState {
  constructor() {
    this.sections = ['household', 'lifestyle', 'experience', 'preferences', 'legal'];
    this.currentSectionIndex = 0;
    this.formData = this.loadFormData();
    this.completedSections = new Set(this.formData.completedSections || []);
    this.dismissedBanners = new Set(this.formData.dismissedBanners || []);
    this.cpsAcknowledged = false;
    this.q30Touched = false;
    this.init();
  }

  init() {
    this.populateStateDropdowns();
    this.setupEventListeners();
    this.restoreValues();
    this.updateSectionDisplay();
    this.updateBranching();
    this.updateProgress();
    this.ensureAccessibility();
  }

  /* ---------- US states ---------- */
  populateStateDropdowns() {
    ['q08_state', 'q30_adoption_state'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      US_STATES.forEach(([abbr, name]) => {
        const opt = document.createElement('option');
        opt.value = abbr;
        opt.textContent = name;
        select.appendChild(opt);
      });
    });
  }

  /* ---------- Event wiring ---------- */
  setupEventListeners() {
    const nextBtn = document.getElementById('nextBtn');
    const backBtn = document.getElementById('backBtn');
    const saveBtn = document.getElementById('saveBtn');
    const form = document.getElementById('intakeForm');

    if (nextBtn) nextBtn.addEventListener('click', () => this.nextSection());
    if (backBtn) backBtn.addEventListener('click', () => this.previousSection());
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveProgress());

    // Live branching + error clearing on any change (delegated, no per-key persistence)
    if (form) {
      form.addEventListener('change', (e) => this.onFieldChange(e));
      form.addEventListener('input', (e) => {
        if (e.target.name === 'q04_child_count') this.renderAgeRows();
      });
    }

    // Dismissible banners
    document.querySelectorAll('.alert-dismiss').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.dismiss;
        this.dismissedBanners.add(id);
        document.getElementById(id)?.classList.remove('show');
      });
    });

    // Sensitive Q20 acknowledgment dialog
    this.setupCpsAcknowledgment();

    // Progress steps: jump to a section (forward jumps validated in goToSection)
    document.querySelectorAll('.progress-step').forEach((step, index) => {
      step.setAttribute('role', 'button');
      step.setAttribute('tabindex', index <= this.currentSectionIndex + 1 ? '0' : '-1');
      step.addEventListener('click', () => this.goToSection(index));
      step.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.goToSection(index);
        }
      });
    });

    window.addEventListener('beforeunload', (e) => {
      if (this.checkForChanges()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });
  }

  onFieldChange(e) {
    const target = e.target;

    // Clear any visible validation error on the touched question
    const block = target.closest('.q-block');
    if (block && block.classList.contains('has-error')) {
      block.classList.remove('has-error');
      block.querySelector('.field-error')?.classList.remove('show');
    }

    // Q20: selecting "Yes" triggers the sensitive acknowledgment before revealing the text
    if (target.name === 'q20_cps_report' && target.value === 'yes' && target.checked) {
      this.openCpsAck();
      return; // branching updates after the user acknowledges
    }

    // Keep Q30 mirrored to Q8 until the user manually overrides Q30
    if (target.name === 'q08_state') this.syncAdoptionStateDefault();
    if (target.name === 'q30_adoption_state') this.q30Touched = true;

    this.updateBranching();
  }

  /* ---------- Branching helpers ---------- */
  getRadio(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  }

  getChecks(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
  }

  getValue(name) {
    const el = document.querySelector(`[name="${name}"]`);
    return el ? el.value : '';
  }

  isQ27Required() {
    const medical = this.getChecks('q25_medical');
    const behavioral = this.getChecks('q26_behavioral');
    const medicalHigh = medical.some(v => ['moderate', 'significant', 'any'].includes(v));
    const behavioralHigh = behavioral.some(v => ['developmental_delays', 'autism', 'trauma_ptsd', 'any'].includes(v));
    return medicalHigh || behavioralHigh;
  }

  toggle(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    if (show && !this.dismissedBanners.has(id)) {
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  updateBranching() {
    // Q3 = Yes -> show Q4 (and ensure age rows reflect the count)
    const hasChildren = this.getRadio('q03_has_children') === 'yes';
    this.toggle('cond-q4', hasChildren);
    if (hasChildren) this.renderAgeRows();

    // Q11 = Yes -> affiliation text
    this.toggle('cond-q11', this.getRadio('q11_religion') === 'yes');

    // Q13 = Yes -> pet types
    this.toggle('cond-q13', this.getRadio('q13_has_pets') === 'yes');

    // Q15 "Other" -> other-language text
    this.toggle('cond-q15', this.getChecks('q15_languages').includes('other'));

    // Q16 any "Yes" -> Q17
    const q16 = this.getRadio('q16_prior_experience');
    this.toggle('cond-q17', q16 === 'foster' || q16 === 'adoption' || q16 === 'both');

    // Q20 = Yes -> explanation (only after acknowledgment)
    this.toggle('cond-q20', this.getRadio('q20_cps_report') === 'yes' && this.cpsAcknowledged);

    // Q27 conditionally required
    const q27Required = this.isQ27Required();
    const q27Star = document.getElementById('q27_star');
    if (q27Star) q27Star.style.display = q27Required ? 'inline' : 'none';
    const q27Group = document.querySelector('#section-preferences [data-question="q27"] .option-group');
    if (q27Group) q27Group.setAttribute('aria-required', q27Required ? 'true' : 'false');

    // Therapist locator: high needs AND Q27 = limited
    const q27 = this.getRadio('q27_support_access');
    this.toggle('card-therapist-locator', q27Required && q27 === 'limited');

    // Trauma directory: Q26 includes PTSD AND Q27 = limited
    this.toggle('card-trauma', this.getChecks('q26_behavioral').includes('trauma_ptsd') && q27 === 'limited');

    // Teen advisory: Q22 includes Teen AND Q28 = Prefer not
    this.toggle('banner-teen', this.getChecks('q22_age_range').includes('teen') && this.getRadio('q28_trauma_openness') === 'prefer_not');

    // ICPC: Q8 != Q30 (both chosen)
    const q8 = this.getValue('q08_state');
    const q30 = this.getValue('q30_adoption_state');
    this.toggle('banner-icpc', !!q8 && !!q30 && q8 !== q30);

    // Q31 = Unsure -> home-study explainer
    this.toggle('card-homestudy', this.getRadio('q31_home_study') === 'unsure');

    // Q33 = seeking assistance -> financial resources
    this.toggle('card-financial', this.getRadio('q33_costs') === 'seeking_assistance');

    // Q35 = Unsure -> legal-aid explainer
    this.toggle('card-legalaid', this.getRadio('q35_legal_rep') === 'unsure');
  }

  /* Default Q30 to Q8 until the user edits Q30 directly. */
  syncAdoptionStateDefault() {
    const q30 = document.getElementById('q30_adoption_state');
    const q8 = document.getElementById('q08_state');
    if (q30 && q8 && !this.q30Touched && !q30.value) {
      q30.value = q8.value;
    }
  }

  /* ---------- Q4 child-age repeater ---------- */
  renderAgeRows() {
    const container = document.getElementById('q04_age_rows');
    const countField = document.getElementById('q04_child_count');
    if (!container || !countField) return;

    let count = parseInt(countField.value, 10);
    if (isNaN(count) || count < 0) count = 0;
    count = Math.min(count, 12);

    const existing = this.collectAgeValues();
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'repeater-row';
      const inputId = `q04_age_${i + 1}`;
      row.innerHTML =
        `<label for="${inputId}">Child ${i + 1} age</label>` +
        `<input type="number" id="${inputId}" name="q04_age_row" min="0" max="17" step="1" inputmode="numeric" value="${existing[i] != null ? existing[i] : ''}">`;
      container.appendChild(row);
    }
  }

  collectAgeValues() {
    return Array.from(document.querySelectorAll('input[name="q04_age_row"]')).map(i => i.value);
  }

  /* ---------- Sensitive Q20 acknowledgment ---------- */
  setupCpsAcknowledgment() {
    const overlay = document.getElementById('cpsAckOverlay');
    const continueBtn = document.getElementById('cpsAckContinue');
    const backBtn = document.getElementById('cpsAckBack');
    if (!overlay) return;

    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        this.cpsAcknowledged = true;
        this.closeCpsAck();
        this.updateBranching();
        document.getElementById('q20_explanation')?.focus();
      });
    }
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // User declined: revert the "Yes" selection so nothing sensitive is collected
        const yes = document.querySelector('input[name="q20_cps_report"][value="yes"]');
        if (yes) yes.checked = false;
        this.cpsAcknowledged = false;
        this.closeCpsAck();
        this.updateBranching();
      });
    }
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') backBtn?.click();
    });
  }

  openCpsAck() {
    const overlay = document.getElementById('cpsAckOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    document.getElementById('cpsAckContinue')?.focus();
  }

  closeCpsAck() {
    document.getElementById('cpsAckOverlay')?.classList.remove('active');
  }

  /* ---------- Navigation ---------- */
  getCurrentSection() {
    return this.sections[this.currentSectionIndex];
  }

  nextSection() {
    if (!this.validateSection(this.getCurrentSection())) return;
    this.saveProgressForSection();

    if (this.currentSectionIndex < this.sections.length - 1) {
      this.currentSectionIndex++;
      this.updateSectionDisplay();
      this.updateProgress();
      this.scrollToTop();
    } else {
      this.completeForm();
    }
  }

  previousSection() {
    // Backward navigation never validates and never clears answers
    this.collectSectionData(this.getCurrentSection());
    if (this.currentSectionIndex > 0) {
      this.currentSectionIndex--;
      this.updateSectionDisplay();
      this.updateProgress();
      this.scrollToTop();
    }
  }

  goToSection(index) {
    if (index < 0 || index >= this.sections.length) return;
    if (index > this.currentSectionIndex + 1) return; // can't skip ahead

    if (index > this.currentSectionIndex) {
      // Moving forward: validate every section up to the target
      for (let i = this.currentSectionIndex; i < index; i++) {
        if (!this.validateSection(this.sections[i])) {
          this.currentSectionIndex = i; // land on the first invalid section
          this.updateSectionDisplay();
          this.updateProgress();
          this.scrollToTop();
          return;
        }
        this.saveProgressForSection(this.sections[i]);
      }
    } else {
      this.collectSectionData(this.getCurrentSection());
    }

    this.currentSectionIndex = index;
    this.updateSectionDisplay();
    this.updateProgress();
    this.scrollToTop();
  }

  /* ---------- Validation ---------- */
  validateSection(section) {
    const required = [...(REQUIRED_FIELDS[section] || [])];
    if (section === 'preferences' && this.isQ27Required()) {
      required.push('q27_support_access');
    }

    let firstInvalid = null;
    let allValid = true;

    required.forEach(name => {
      const valid = this.isFieldFilled(name);
      const block = this.getBlockFor(name);
      if (!valid) {
        allValid = false;
        if (block) {
          block.classList.add('has-error');
          block.querySelector('.field-error')?.classList.add('show');
          if (!firstInvalid) firstInvalid = block;
        }
      } else if (block) {
        block.classList.remove('has-error');
        block.querySelector('.field-error')?.classList.remove('show');
      }
    });

    if (!allValid && firstInvalid) {
      firstInvalid.querySelector('input, select, textarea')?.focus();
      this.showNotification('Please complete the required fields before continuing.', 'error');
    }
    return allValid;
  }

  isFieldFilled(name) {
    const els = document.querySelectorAll(`[name="${name}"]`);
    if (!els.length) return true;
    const first = els[0];
    if (first.type === 'radio' || first.type === 'checkbox') {
      return Array.from(els).some(el => el.checked);
    }
    if (first.tagName === 'SELECT') {
      return first.value !== '';
    }
    if (first.type === 'number') {
      const v = first.value;
      if (v === '') return false;
      const n = Number(v);
      const min = first.min !== '' ? Number(first.min) : -Infinity;
      const max = first.max !== '' ? Number(first.max) : Infinity;
      return !isNaN(n) && n >= min && n <= max;
    }
    return first.value.trim() !== '';
  }

  getBlockFor(name) {
    return document.querySelector(`[name="${name}"]`)?.closest('.q-block') || null;
  }

  /* ---------- Data collection / persistence ----------
   * Stable per-question keys (q01_adults … q35_legal_rep) for downstream scoring/routing.
   */
  collectSectionData(section) {
    const sectionEl = document.getElementById(`section-${section}`);
    if (!sectionEl) return;
    if (!this.formData[section]) this.formData[section] = {};
    const data = this.formData[section];

    const seen = new Set();
    sectionEl.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
      const name = el.name;
      if (seen.has(name)) return;
      seen.add(name);

      if (el.type === 'radio') {
        const checked = sectionEl.querySelector(`input[name="${name}"]:checked`);
        data[name] = checked ? checked.value : null;
      } else if (el.type === 'checkbox') {
        data[name] = Array.from(sectionEl.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
      } else if (name === 'q04_age_row') {
        data['q04_ages'] = this.collectAgeValues();
      } else {
        data[name] = el.value;
      }
    });
  }

  restoreValues() {
    this.sections.forEach(section => {
      const data = this.formData[section];
      if (!data) return;

      Object.keys(data).forEach(name => {
        if (name === 'q04_ages') return; // handled after count restore
        const value = data[name];
        const els = document.querySelectorAll(`[name="${name}"]`);
        if (!els.length) return;

        if (els[0].type === 'radio') {
          els.forEach(el => { el.checked = (el.value === value); });
        } else if (els[0].type === 'checkbox') {
          const arr = Array.isArray(value) ? value : [];
          els.forEach(el => { el.checked = arr.includes(el.value); });
        } else {
          els[0].value = value == null ? '' : value;
        }
      });
    });

    // Q20: if a Yes was previously stored, treat it as already acknowledged so the
    // explanation re-appears on reload without re-prompting.
    if (this.formData.experience && this.formData.experience.q20_cps_report === 'yes') {
      this.cpsAcknowledged = true;
    }
    // Q30 was previously chosen -> respect it as a manual override
    if (this.formData.legal && this.formData.legal.q30_adoption_state) {
      this.q30Touched = true;
    }

    // Rebuild Q4 age rows from stored count + ages
    this.renderAgeRows();
    const ages = (this.formData.household && this.formData.household.q04_ages) || [];
    document.querySelectorAll('input[name="q04_age_row"]').forEach((el, i) => {
      if (ages[i] != null) el.value = ages[i];
    });
  }

  saveProgressForSection(section) {
    const sec = section || this.getCurrentSection();
    this.collectSectionData(sec);
    this.completedSections.add(sec);
    this.saveFormData();
  }

  saveProgress() {
    this.collectSectionData(this.getCurrentSection());
    this.saveFormData();
    this.showNotification('Progress saved successfully', 'success');
  }

  /* ---------- Display / progress ---------- */
  updateSectionDisplay() {
    document.querySelectorAll('.form-section').forEach(section => {
      section.classList.remove('active');
      section.style.display = 'none';
    });
    const current = document.getElementById(`section-${this.getCurrentSection()}`);
    if (current) {
      current.style.display = 'block';
      setTimeout(() => current.classList.add('active'), 10);
    }
    // Default Q30 when arriving at the legal section
    if (this.getCurrentSection() === 'legal') this.syncAdoptionStateDefault();
    this.updateBranching();
    this.updateButtons();
    this.updateProgressSteps();
  }

  updateButtons() {
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    const isLast = this.currentSectionIndex === this.sections.length - 1;
    if (backBtn) backBtn.style.display = this.currentSectionIndex > 0 ? 'block' : 'none';
    if (nextBtn) nextBtn.textContent = isLast ? 'Submit & Complete →' : 'Next Section →';
  }

  updateProgress() {
    const percent = Math.round((this.completedSections.size / this.sections.length) * 100);
    const percentEl = document.getElementById('percentComplete');
    const fill = document.querySelector('.progress-bar-fill');
    if (percentEl) percentEl.textContent = percent;
    if (fill) fill.style.width = `${percent}%`;
    this.updateProgressSteps();
  }

  updateProgressSteps() {
    document.querySelectorAll('.progress-step').forEach((step, index) => {
      const section = this.sections[index];
      const isCompleted = this.completedSections.has(section);
      const isCurrent = index === this.currentSectionIndex;
      const isAccessible = index <= this.currentSectionIndex + 1;
      step.classList.toggle('completed', isCompleted);
      step.classList.toggle('current', isCurrent);
      step.classList.toggle('accessible', isAccessible);
      step.setAttribute('tabindex', isAccessible ? '0' : '-1');
      let label = `Section ${index + 1}: ${this.formatSectionName(section)}`;
      if (isCompleted) label += ', completed';
      if (isCurrent) label += ', current';
      step.setAttribute('aria-label', label);
    });
  }

  formatSectionName(section) {
    return {
      household: 'Household Profile',
      lifestyle: 'Lifestyle & Values',
      experience: 'Experience & Background',
      preferences: 'Adoption Preferences',
      legal: 'Legal Readiness'
    }[section] || section;
  }

  /* ---------- localStorage ---------- */
  loadFormData() {
    const saved = localStorage.getItem('havenlink_intake_form');
    if (saved) {
      try { return JSON.parse(saved); }
      catch (e) { console.error('Failed to parse saved form data:', e); }
    }
    return this.createEmptyFormData();
  }

  createEmptyFormData() {
    return {
      household: {}, lifestyle: {}, experience: {}, preferences: {}, legal: {},
      completedSections: [], dismissedBanners: [],
      lastSaved: null, startedAt: new Date().toISOString()
    };
  }

  saveFormData() {
    this.formData.lastSaved = new Date().toISOString();
    this.formData.completedSections = Array.from(this.completedSections);
    this.formData.dismissedBanners = Array.from(this.dismissedBanners);
    try {
      localStorage.setItem('havenlink_intake_form', JSON.stringify(this.formData));
    } catch (e) {
      console.error('Failed to save form data:', e);
      this.showNotification('Failed to save progress. Please try again.', 'error');
    }
  }

  checkForChanges() {
    // Warn before leaving if the current section was started but not yet saved
    return this.currentSectionIndex >= 0 && !this.completedSections.has(this.getCurrentSection());
  }

  /* ---------- Submit ---------- */
  async completeForm() {
    // Collect every section so the full answer set is persisted locally.
    this.sections.forEach(s => this.collectSectionData(s));
    this.saveFormData();

    // PRIVACY: submission emails the answer set to HavenLink only. The account id
    // (the signed-in user's email) is attached server-side from the session. Family
    // intake data is still only shared with an AGENCY on an explicit, separate
    // inquiry action — not on form submit.
    //
    // TODO: scoring + routing
    //   - deterministic match-score (0–100), age-range recommendation, agency routing,
    //     readiness-stage classification, flags. These are downstream of the form and
    //     should run server-side against the collected `this.formData` keyed answers.

    if (INTAKE_BACKEND_DISABLED) {
      this.showNotification(INTAKE_BACKEND_DISABLED_MESSAGE, 'info');
      return;
    }

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.disabled = true;
    try {
      // Same double-submit CSRF pattern as account.js: fetch the token, echo it
      // in the x-csrf-token header (the cookie half is httpOnly).
      const csrfRes = await fetch('/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
      if (!csrfRes.ok) throw new Error('Could not get CSRF token');
      const { csrfToken } = await csrfRes.json();

      const res = await fetch('/api/intake-submission', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({
          household: this.formData.household,
          lifestyle: this.formData.lifestyle,
          experience: this.formData.experience,
          preferences: this.formData.preferences,
          legal: this.formData.legal,
          startedAt: this.formData.startedAt
        })
      });
      if (!res.ok) throw new Error(`Submission failed (${res.status})`);

      this.showNotification('Intake form submitted successfully! Redirecting…', 'success');
      setTimeout(() => { window.location.href = '/adopt/agency-profiles'; }, 2000);
    } catch (e) {
      console.error('Intake submission failed:', e);
      this.showNotification('Submission failed. Please try again.', 'error');
      if (nextBtn) nextBtn.disabled = false;
    }
  }

  /* ---------- Accessibility ---------- */
  ensureAccessibility() {
    if (!document.getElementById('intakeForm')) return;
    document.querySelectorAll('.form-section').forEach((section, index) => {
      section.setAttribute('role', 'region');
      section.setAttribute('aria-label', `Section ${index + 1}: ${this.formatSectionName(section.dataset.section)}`);
    });
  }

  showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.setAttribute('role', 'status');
    n.setAttribute('aria-live', 'polite');
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => {
      n.classList.add('fade-out');
      setTimeout(() => n.remove(), 300);
    }, 3000);
  }

  scrollToTop() {
    const active = document.querySelector('.form-section.active') || document.querySelector('.form-section');
    if (active) {
      const offset = 140;
      const top = active.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top - offset, behavior: 'smooth' });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.intakeFormState = new IntakeFormState();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntakeFormState;
}
