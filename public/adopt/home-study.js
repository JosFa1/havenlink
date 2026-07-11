/**
 * HavenLink Home Study Flow
 * Two-path interactive flow on the Home Study page:
 *   Path A ("completed")  - collects state / agency / completion date, then routes
 *                           the family to the Family Intake Form (Step 2).
 *   Path B ("screener")   - all-states readiness screener: state selection, 7
 *                           universal questions, then state-specific questions
 *                           injected from /adopt/home-study-config.json. Ends at
 *                           the preparation resources section.
 * Both paths email HavenLink via POST /api/home-study-submission (the account id
 * is attached server-side from the session, same as the intake form).
 *
 * State rules are NOT hardcoded here - they live in home-study-config.json so
 * they can be updated without touching this file. The 7 universal questions are
 * fixed by spec for every state, so they live here.
 */

/* US states + DC (same list as intake.js - no bundler, each page keeps its own copy). */
const HS_US_STATES = [
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

const HS_MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December']
];

/* The 7 universal screener questions (asked in every state, in this order).
 * Same object schema as the config's additionalQuestions. [State] placeholders
 * are substituted with the selected state's name at render time. */
const HS_UNIVERSAL_QUESTIONS = [
  {
    id: 'u1_age',
    question: 'Are you at least 18 years of age?',
    why: '18 is the federal minimum in all 50 states. Some states and agencies have higher requirements.',
    inputType: 'yes_no',
    disqualifyOn: 'no',
    disqualifyMessage: 'You must be at least 18 years old to begin the home study process in [State]. Please check back when you meet this requirement.',
    nextSteps: [
      "Check back once you're 18. There is no penalty for waiting.",
      'In the meantime, learn what to expect with the preparation resources below'
    ]
  },
  {
    id: 'u2_background',
    question: 'Are you and all adults living in your household prepared to complete a criminal background check?',
    why: 'All 50 states require criminal background checks for at least the primary applicant(s). Most states extend this to all adults in the household.',
    inputType: 'yes_no',
    disqualifyOn: 'no',
    disqualifyMessage: 'A criminal background check is required for all adults in your household in [State]. This typically includes a state-level check and, in many states, an FBI fingerprint-based check. Visit our preparation resources to learn how to get started.',
    nextSteps: [
      'Talk with the adults in your household about the requirement',
      'Review the Documentation Checklist below to see what the checks involve'
    ]
  },
  {
    id: 'u3_criminal',
    question: 'To your knowledge, does anyone in your household have a conviction for child abuse, child neglect, a sexual offense involving a minor, or the murder or voluntary manslaughter of any person?',
    why: 'These are federally mandated permanent bars to adoption under the Adoption and Safe Families Act (ASFA). They apply in every state without exception.',
    inputType: 'yes_no',
    disqualifyOn: 'yes',
    disqualifyMessage: 'Certain criminal convictions are permanent bars to adoption approval in all U.S. states under federal law. We recommend speaking with a licensed adoption attorney in [State] to understand your options.',
    nextSteps: [
      'Speak with a licensed adoption attorney in your state about your specific situation',
      'An attorney can confirm whether the conviction is actually a federal bar'
    ]
  },
  {
    id: 'u4_medical',
    question: 'Are all adults in your household able to complete a medical evaluation by a licensed physician, who will confirm you are physically and mentally capable of caring for a child?',
    why: 'Medical evaluations are required in all states. The physician must certify fitness to parent.',
    inputType: 'yes_no',
    disqualifyOn: 'no',
    disqualifyMessage: 'A medical evaluation is required for all adults in the home in [State]. Many health conditions do not disqualify applicants. A licensed physician must confirm your ability to care for a child. Visit our preparation resources for guidance.',
    nextSteps: [
      'Talk with your physician first because many conditions do not disqualify applicants',
      'Schedule physical exams for the adults in your household'
    ]
  },
  {
    id: 'u5_financial',
    question: "Do you have a stable, legal, and verifiable source of income that can cover a child's housing, food, medical care, and education without depending on public assistance?",
    why: 'No state requires a specific income dollar amount. Income must be sufficient, legal, and verifiable. Receiving some forms of public assistance does not automatically disqualify an applicant.',
    inputType: 'yes_no',
    disqualifyOn: 'no',
    disqualifyMessage: "Financial stability is a key part of the home study in [State]. You must show that your income is stable and sufficient to meet a child's needs. Visit our resources for guidance on documenting your finances.",
    nextSteps: [
      'Gather pay stubs, tax returns, and bank statements to see where you stand',
      'Use the Documentation Checklist below to organize your financial records'
    ]
  },
  {
    id: 'u6_space',
    question: 'Does your home have adequate space to provide a child with a safe, appropriate sleeping area?',
    why: 'Most states allow a child to share a bedroom when the sleeping space is designated and appropriate. A couch, hallway, or shared adult bed does not qualify.',
    inputType: 'yes_no',
    disqualifyOn: 'no',
    disqualifyMessage: 'Your home must have adequate space for a child, including a proper sleeping area. Review our home preparation guide for details on what social workers look for during a home visit in [State].',
    nextSteps: [
      "A child usually needs a designated, appropriate sleeping space, though a separate bedroom is not always required",
      'See the Prepare Your Home checklist below for what social workers look for'
    ]
  },
  {
    id: 'u7_safety',
    question: 'Is your home free of major safety hazards? This includes working smoke detectors, carbon monoxide detectors, medications and chemicals stored safely out of reach, and no exposed electrical hazards.',
    why: 'These safety features are universal across all state home study standards.',
    inputType: 'yes_no',
    disqualifyOn: 'no',
    disqualifyMessage: "Basic home safety is required for a home study approval in [State]. Our preparation guide includes a room-by-room checklist so you know exactly what to address before the social worker's visit.",
    nextSteps: [
      'Work through the room-by-room checklist in Prepare Your Home below',
      'Detectors, locks, and safe storage address many common home-safety issues'
    ]
  }
];

const HS_STORAGE_FLOW = 'havenlink_home_study';
const HS_STORAGE_PREP = 'havenlink_home_study_prep';
const HS_CONFIG_URL = '/adopt/home-study-config.json';

class HomeStudyFlow {
  constructor() {
    this.flowEl = document.getElementById('home-study-flow');
    this.host = document.getElementById('hsScreenHost');
    this.forkEl = document.getElementById('get-started');
    this.stepIndicator = document.getElementById('hsStepIndicator');
    this.config = null;
    this.submitting = false;
    this.state = this.loadState();
    // The account's saved residence state (from a prior intake/home-study
    // submission), used to pre-fill the state select. Loaded async below.
    this.savedState = '';

    this.setupEventListeners();
    this.initPrepChecklists();

    // Resume an unsubmitted in-progress run (localStorage is per-browser, not
    // per-account - same accepted trade-off as the intake form).
    if (this.state.path && !this.state.submitted) {
      this.enterFlow();
    }

    this.loadSavedState();
  }

  /* Fetch the account's saved state so the state step auto-fills from a value
     entered on the intake form (or a prior home-study submission). Convenience
     only - failures are silent. Re-applies to the state screen if it's already
     mounted when the fetch resolves. */
  async loadSavedState() {
    try {
      const res = await fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const state = data && data.user && data.user.state;
      if (!state) return;
      this.savedState = state;
      this.applySavedStateToCurrentScreen();
    } catch (e) {
      /* prefill is a convenience; ignore network/parse errors */
    }
  }

  /* If a state select is on screen and still empty, fill it with the saved
     state. The value is committed to flow state when the user hits Continue. */
  applySavedStateToCurrentScreen() {
    if (!this.savedState || !this.host) return;
    const select = this.host.querySelector('#aState, #bState');
    if (select && !select.value) select.value = this.savedState;
  }

  /* ---------- Setup ---------- */
  setupEventListeners() {
    const forkCompleted = document.getElementById('forkCompleted');
    const forkNotYet = document.getElementById('forkNotYet');
    const startOver = document.getElementById('hsStartOver');
    if (forkCompleted) forkCompleted.addEventListener('click', () => this.startPath('completed'));
    if (forkNotYet) forkNotYet.addEventListener('click', () => this.startPath('screener'));
    if (startOver) startOver.addEventListener('click', () => this.startOver());
  }

  defaultState() {
    return {
      path: null,
      screenIndex: 0,
      a: { state: '', agency: '', month: '', year: '' },
      b: { stateCode: '', answers: {}, result: null, stoppingQuestionId: null },
      submitted: false,
      updatedAt: null
    };
  }

  /* ---------- Flow control ---------- */
  startPath(path) {
    this.state = this.defaultState();
    this.state.path = path;
    this.saveState();
    this.enterFlow();
  }

  enterFlow() {
    if (this.forkEl) this.forkEl.hidden = true;
    this.flowEl.hidden = false;
    if (this.state.path === 'screener' && !this.config) {
      this.loadConfig();
    } else {
      this.render();
    }
    this.scrollToFlow();
  }

  startOver() {
    this.state = this.defaultState();
    this.saveState();
    this.flowEl.hidden = true;
    if (this.forkEl) this.forkEl.hidden = false;
    this.host.replaceChildren();
    this.stepIndicator.textContent = '';
    this.scrollToFlow();
  }

  /* ---------- Config ---------- */
  async loadConfig() {
    try {
      const res = await fetch(HS_CONFIG_URL, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Config fetch failed (${res.status})`);
      const config = await res.json();
      if (!config || typeof config !== 'object' || !config.DEFAULT ||
          !Array.isArray(config.DEFAULT.additionalQuestions)) {
        throw new Error('Config is malformed');
      }
      this.config = config;
      this.render();
    } catch (e) {
      console.error('Home study config load failed:', e);
      this.renderConfigError();
    }
  }

  stateNameFor(code) {
    const entry = HS_US_STATES.find(([abbr]) => abbr === code);
    return entry ? entry[1] : code;
  }

  getStateEntry(code) {
    const entry = this.config && this.config[code];
    if (entry && Array.isArray(entry.additionalQuestions)) return entry;
    return Object.assign({}, this.config.DEFAULT, { stateName: this.stateNameFor(code) });
  }

  /* Universal questions first, then the state's additional questions, each
   * tagged so the referral email can group them. */
  buildQuestionList(code) {
    const universal = HS_UNIVERSAL_QUESTIONS.map(q => Object.assign({ universal: true }, q));
    const stateQs = this.getStateEntry(code).additionalQuestions.map(
      q => Object.assign({ universal: false }, q)
    );
    return universal.concat(stateQs);
  }

  /* ---------- Rendering ---------- */
  mount(templateId) {
    const tpl = document.getElementById(templateId);
    this.host.replaceChildren(tpl.content.cloneNode(true));
    return this.host;
  }

  setStepIndicator(text) {
    this.stepIndicator.textContent = text;
  }

  render() {
    if (this.state.path === 'completed') {
      this.renderPathA();
    } else if (this.state.path === 'screener') {
      this.renderPathB();
    }
  }

  renderPathA() {
    const idx = this.state.screenIndex;
    if (idx === 0) this.renderAState();
    else if (idx === 1) this.renderAAgency();
    else if (idx === 2) this.renderADate();
    else this.renderAEnd();
  }

  renderPathB() {
    if (this.state.b.result) {
      this.renderScreenerEnd();
      return;
    }
    if (this.state.screenIndex === 0) {
      this.renderBState();
      return;
    }
    const questions = this.buildQuestionList(this.state.b.stateCode);
    const qIndex = this.state.screenIndex - 1;
    if (qIndex >= questions.length) {
      // Shouldn't happen (finishScreener fires on the last answer), but recover safely.
      this.finishScreener('PASSED', null);
      return;
    }
    this.renderQuestionScreen(questions[qIndex], qIndex, questions.length);
  }

  renderAState() {
    this.setStepIndicator('Step 1 of 3');
    this.mount('tpl-a-state');
    const select = this.host.querySelector('#aState');
    this.populateStateSelect(select, false);
    select.value = this.state.a.state || this.savedState || '';
    this.wireContinue(() => {
      if (!select.value) return this.showFieldError();
      this.state.a.state = select.value;
      this.advance(1);
    });
    this.focusFirst();
  }

  renderAAgency() {
    this.setStepIndicator('Step 2 of 3');
    this.mount('tpl-a-agency');
    const input = this.host.querySelector('#aAgency');
    input.value = this.state.a.agency;
    this.wireBack(0);
    this.wireContinue(() => {
      if (!input.value.trim()) return this.showFieldError();
      this.state.a.agency = input.value.trim();
      this.advance(2);
    });
    this.focusFirst();
  }

  renderADate() {
    this.setStepIndicator('Step 3 of 3');
    this.mount('tpl-a-date');
    const monthSel = this.host.querySelector('#aMonth');
    const yearSel = this.host.querySelector('#aYear');
    HS_MONTHS.forEach(([value, label]) => monthSel.append(new Option(label, value)));
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 30; y--) {
      yearSel.append(new Option(String(y), String(y)));
    }
    monthSel.value = this.state.a.month;
    yearSel.value = this.state.a.year;
    this.wireBack(1);
    this.wireContinue(() => {
      if (!monthSel.value || !yearSel.value) return this.showFieldError();
      this.state.a.month = monthSel.value;
      this.state.a.year = yearSel.value;
      this.finishPathA();
    });
    this.focusFirst();
  }

  renderAEnd() {
    this.setStepIndicator('');
    this.mount('tpl-a-end');
    if (this.isCompletionExpired()) {
      const note = this.host.querySelector('[data-expired-note]');
      if (note) note.hidden = false;
    }
    this.wireEndScreenActions();
  }

  renderBState() {
    this.setStepIndicator('Step 1');
    this.mount('tpl-b-state');
    const select = this.host.querySelector('#bState');
    this.populateStateSelect(select, true);
    select.value = this.state.b.stateCode || this.savedState || '';
    this.wireContinue(() => {
      if (!select.value) return this.showFieldError();
      this.selectScreenerState(select.value);
    });
    this.focusFirst();
  }

  renderQuestionScreen(q, qIndex, totalQuestions) {
    const stateName = this.currentScreenerStateName();
    this.setStepIndicator(`Step ${qIndex + 2} of ${totalQuestions + 1}`);
    this.mount('tpl-b-question');

    this.host.querySelector('[data-q-text]').textContent = this.substituteState(q.question, stateName);
    this.host.querySelector('[data-q-why]').textContent = q.why ? `Why we ask: ${q.why}` : '';

    const naOption = this.host.querySelector('[data-q-na]');
    if (q.inputType === 'yes_no_na') {
      naOption.hidden = false;
      this.host.querySelector('[data-q-na-label]').textContent = q.naLabel || 'Not applicable';
    }

    const saved = this.state.b.answers[q.id];
    if (saved) {
      const radio = this.host.querySelector(`input[name="hsAnswer"][value="${saved}"]`);
      if (radio) radio.checked = true;
    }

    // Back from the first question would land on state selection; changing state
    // invalidates state-specific answers, so that's only reachable via Start over.
    if (qIndex === 0) {
      const backBtn = this.host.querySelector('[data-action="back"]');
      if (backBtn) backBtn.hidden = true;
    } else {
      this.wireBack(this.state.screenIndex - 1);
    }

    this.wireContinue(() => {
      const checked = this.host.querySelector('input[name="hsAnswer"]:checked');
      if (!checked) return this.showFieldError();
      this.answerQuestion(q, checked.value, qIndex, totalQuestions);
    });
    this.focusFirst();
  }

  renderScreenerEnd() {
    this.setStepIndicator('');
    const result = this.state.b.result;
    if (result === 'INTERNATIONAL') {
      this.mount('tpl-b-international');
    } else if (result === 'NOT_YET_ELIGIBLE') {
      this.mount('tpl-b-disqualified');
      const q = this.findQuestionById(this.state.b.stoppingQuestionId);
      const stateName = this.currentScreenerStateName();
      this.host.querySelector('[data-dq-message]').textContent =
        q ? this.substituteState(q.disqualifyMessage, stateName) : '';
      const list = this.host.querySelector('[data-dq-steps]');
      (q && q.nextSteps ? q.nextSteps : []).forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        list.appendChild(li);
      });
    } else {
      this.mount('tpl-b-passed');
      const msg = this.host.querySelector('[data-passed-message]');
      msg.textContent = this.substituteState(msg.textContent.trim(), this.currentScreenerStateName());
    }
    this.wireEndScreenActions();
  }

  renderConfigError() {
    this.setStepIndicator('');
    this.mount('tpl-config-error');
    const retry = this.host.querySelector('[data-action="retry"]');
    if (retry) retry.addEventListener('click', () => this.loadConfig());
    this.wireEndScreenActions();
  }

  /* ---------- Render helpers ---------- */
  populateStateSelect(select, includeInternational) {
    HS_US_STATES.forEach(([code, name]) => select.append(new Option(name, code)));
    if (includeInternational) {
      select.append(new Option('I live outside the United States', 'INTL'));
    }
  }

  substituteState(text, stateName) {
    return String(text || '').replace(/\[State\]/g, stateName || 'your state');
  }

  currentScreenerStateName() {
    const code = this.state.b.stateCode;
    if (code === 'INTL') return 'Outside the United States';
    if (!code) return '';
    const entry = this.getStateEntry(code);
    return entry.stateName || this.stateNameFor(code);
  }

  findQuestionById(id) {
    return this.buildQuestionList(this.state.b.stateCode).find(q => q.id === id) || null;
  }

  wireContinue(handler) {
    const btn = this.host.querySelector('[data-action="continue"]');
    if (btn) btn.addEventListener('click', handler);
  }

  wireBack(targetIndex) {
    const btn = this.host.querySelector('[data-action="back"]');
    if (btn) {
      btn.addEventListener('click', () => {
        this.state.screenIndex = targetIndex;
        this.saveState();
        this.render();
      });
    }
  }

  wireEndScreenActions() {
    const resources = this.host.querySelector('[data-action="resources"]');
    if (resources) resources.addEventListener('click', () => this.scrollToResources());
    const startover = this.host.querySelector('[data-action="startover"]');
    if (startover) startover.addEventListener('click', () => this.startOver());
    // Reached on resume after a failed/interrupted send: offer a manual retry
    // instead of auto-sending (the first attempt may have actually gone through).
    if (!this.state.submitted && !this.submitting) {
      this.renderSubmitStatus('retry');
    }
  }

  showFieldError() {
    const error = this.host.querySelector('[data-q-error]');
    if (error) error.classList.add('show');
  }

  focusFirst() {
    const target = this.host.querySelector('select, input, button');
    if (target) target.focus({ preventScroll: true });
  }

  scrollToFlow() {
    const target = this.flowEl.hidden ? this.forkEl : this.flowEl;
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top - 140, behavior: 'smooth' });
    }
  }

  scrollToResources() {
    const section = document.getElementById('preparation-resources');
    if (!section) return;
    const first = document.getElementById('prep-interview');
    if (first) first.open = true;
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - 140, behavior: 'smooth' });
  }

  /* ---------- Answers / navigation ---------- */
  advance(nextIndex) {
    this.state.screenIndex = nextIndex;
    this.saveState();
    this.render();
    this.scrollToFlow();
  }

  selectScreenerState(code) {
    this.state.b.stateCode = code;
    if (code === 'INTL') {
      this.finishScreener('INTERNATIONAL', null);
      return;
    }
    this.advance(1);
  }

  answerQuestion(q, value, qIndex, totalQuestions) {
    this.state.b.answers[q.id] = value;
    if (value === q.disqualifyOn) {
      this.finishScreener('NOT_YET_ELIGIBLE', q);
      return;
    }
    if (qIndex + 1 >= totalQuestions) {
      this.finishScreener('PASSED', null);
      return;
    }
    this.advance(this.state.screenIndex + 1);
  }

  finishScreener(result, stoppingQuestion) {
    this.state.b.result = result;
    this.state.b.stoppingQuestionId = stoppingQuestion ? stoppingQuestion.id : null;
    this.saveState();
    this.renderScreenerEnd();
    this.scrollToFlow();
    this.submit();
  }

  finishPathA() {
    this.state.screenIndex = 3;
    this.saveState();
    this.renderAEnd();
    this.scrollToFlow();
    this.submit();
  }

  isCompletionExpired() {
    const { month, year } = this.state.a;
    if (!month || !year) return false;
    const now = new Date();
    const months = (now.getFullYear() - Number(year)) * 12 + (now.getMonth() + 1 - Number(month));
    return months > 24;
  }

  /* ---------- Persistence ---------- */
  loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(HS_STORAGE_FLOW));
      if (saved && typeof saved === 'object' && saved.path) {
        return Object.assign(this.defaultState(), saved);
      }
    } catch (e) {
      console.warn('Could not load saved home study flow:', e);
    }
    return this.defaultState();
  }

  saveState() {
    try {
      this.state.updatedAt = new Date().toISOString();
      localStorage.setItem(HS_STORAGE_FLOW, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Could not save home study flow:', e);
    }
  }

  /* ---------- Preparation resource checklists ---------- */
  initPrepChecklists() {
    const section = document.getElementById('preparation-resources');
    if (!section) return;
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(HS_STORAGE_PREP)) || {};
    } catch (e) { /* corrupted storage - start fresh */ }

    section.querySelectorAll('input[data-checklist]').forEach(box => {
      const group = saved[box.dataset.checklist] || {};
      box.checked = Boolean(group[box.dataset.item]);
    });

    section.addEventListener('change', (e) => {
      const box = e.target;
      if (!box.matches('input[data-checklist]')) return;
      let store = {};
      try {
        store = JSON.parse(localStorage.getItem(HS_STORAGE_PREP)) || {};
      } catch (err) { /* start fresh */ }
      const group = store[box.dataset.checklist] || {};
      if (box.checked) group[box.dataset.item] = true;
      else delete group[box.dataset.item];
      store[box.dataset.checklist] = group;
      try {
        localStorage.setItem(HS_STORAGE_PREP, JSON.stringify(store));
      } catch (err) { /* storage full/blocked - checkbox state still shows in-page */ }
      this.updateChecklistProgress(box.dataset.checklist);
    });

    this.updateChecklistProgress('docs');
    this.updateChecklistProgress('home');
  }

  updateChecklistProgress(kind) {
    const boxes = document.querySelectorAll(`input[data-checklist="${kind}"]`);
    if (boxes.length === 0) return;
    const done = Array.from(boxes).filter(b => b.checked).length;
    const counter = document.getElementById(kind === 'docs' ? 'docsProgress' : 'homeProgress');
    if (counter) counter.textContent = `${done} of ${boxes.length} complete`;
  }

  /* ---------- Submission ---------- */
  buildPayload() {
    if (this.state.path === 'completed') {
      const { state, agency, month, year } = this.state.a;
      return {
        path: 'completed',
        state,
        stateName: this.stateNameFor(state),
        agency,
        completedMonth: `${year}-${month}`
      };
    }
    const questions = this.buildQuestionList(this.state.b.stateCode);
    const answers = [];
    questions.forEach(q => {
      const answer = this.state.b.answers[q.id];
      if (!answer) return; // unanswered (user was disqualified earlier)
      answers.push({
        id: q.id,
        question: this.substituteState(q.question, this.currentScreenerStateName()),
        answer,
        pass: answer !== q.disqualifyOn,
        universal: q.universal
      });
    });
    const stopping = this.findQuestionById(this.state.b.stoppingQuestionId);
    return {
      path: 'screener',
      result: this.state.b.result,
      state: this.state.b.stateCode,
      stateName: this.currentScreenerStateName(),
      answers,
      stoppingQuestion: stopping
        ? { id: stopping.id, question: this.substituteState(stopping.question, this.currentScreenerStateName()) }
        : null
    };
  }

  async submit() {
    if (this.state.submitted || this.submitting) return;
    this.submitting = true;
    this.renderSubmitStatus('sending');
    try {
      // Same double-submit CSRF pattern as intake.js/account.js: fetch the token,
      // echo it in the x-csrf-token header (the cookie half is httpOnly).
      const csrfRes = await fetch('/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
      if (!csrfRes.ok) throw new Error('Could not get CSRF token');
      const { csrfToken } = await csrfRes.json();

      const res = await fetch('/api/home-study-submission', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify(this.buildPayload())
      });
      if (!res.ok) throw new Error(`Submission failed (${res.status})`);

      this.state.submitted = true;
      this.saveState();
      this.renderSubmitStatus('sent');
    } catch (e) {
      console.error('Home study submission failed:', e);
      this.renderSubmitStatus('error');
    } finally {
      this.submitting = false;
    }
  }

  renderSubmitStatus(status) {
    const el = this.host.querySelector('[data-submit-status]');
    if (!el) return;
    el.replaceChildren();
    el.classList.remove('hs-status-error', 'hs-status-sent');
    if (status === 'sending') {
      el.textContent = 'Sending your details to HavenLink…';
    } else if (status === 'sent') {
      el.classList.add('hs-status-sent');
      el.textContent = '✓ Sent. The HavenLink team has been notified.';
    } else {
      el.classList.add('hs-status-error');
      el.textContent = status === 'error'
        ? "We couldn't send your details to HavenLink. "
        : 'Your details have not been sent to HavenLink yet. ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn-link';
      retry.textContent = status === 'error' ? 'Try again' : 'Send now';
      retry.addEventListener('click', () => this.submit());
      el.appendChild(retry);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('home-study-flow')) {
    window.homeStudyFlow = new HomeStudyFlow();
  }
});
