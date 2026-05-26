/**
 * HavenLink Intake Form State Management
 * Handles form navigation, state persistence, and progress tracking
 */

class IntakeFormState {
  constructor() {
    this.sections = ['household', 'lifestyle', 'experience', 'preferences', 'legal'];
    this.currentSectionIndex = 0;
    this.formData = this.loadFormData();
    this.completedSections = new Set(this.formData.completedSections || []);
    this.init();
  }

  /**
   * Initialize the form
   */
  init() {
    this.setupEventListeners();
    this.updateProgress();
    this.ensureAccessibility();
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    const nextBtn = document.getElementById('nextBtn');
    const backBtn = document.getElementById('backBtn');
    const saveBtn = document.getElementById('saveBtn');
    const progressSteps = document.querySelectorAll('.progress-step');

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextSection());
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => this.previousSection());
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveProgress());
    }

    // Allow clicking on progress steps to jump to sections
    progressSteps.forEach((step, index) => {
      step.addEventListener('click', () => {
        if (index <= this.currentSectionIndex + 1) {
          this.goToSection(index);
        }
      });

      // Make progress steps keyboard accessible
      step.setAttribute('role', 'button');
      step.setAttribute('tabindex', index <= this.currentSectionIndex + 1 ? '0' : '-1');
      step.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && index <= this.currentSectionIndex + 1) {
          this.goToSection(index);
        }
      });
    });

    // Window beforeunload to prompt if unsaved changes
    window.addEventListener('beforeunload', (e) => {
      const hasUnsavedChanges = this.checkForChanges();
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });
  }

  /**
   * Get current section
   */
  getCurrentSection() {
    return this.sections[this.currentSectionIndex];
  }

  /**
   * Navigate to next section
   */
  nextSection() {
    if (this.currentSectionIndex < this.sections.length - 1) {
      this.saveProgressForSection();
      this.currentSectionIndex++;
      this.updateSectionDisplay();
      this.updateProgress();
      this.scrollToTop();
    } else {
      // Last section - submit form (future: send to backend)
      this.completeForm();
    }
  }

  /**
   * Navigate to previous section
   */
  previousSection() {
    if (this.currentSectionIndex > 0) {
      this.saveProgressForSection();
      this.currentSectionIndex--;
      this.updateSectionDisplay();
      this.updateProgress();
      this.scrollToTop();
    }
  }

  /**
   * Jump to specific section
   */
  goToSection(index) {
    if (index >= 0 && index <= this.currentSectionIndex + 1 && index < this.sections.length) {
      this.saveProgressForSection();
      this.currentSectionIndex = index;
      this.updateSectionDisplay();
      this.updateProgress();
      this.scrollToTop();
    }
  }

  /**
   * Save progress for current section
   */
  saveProgressForSection() {
    const currentSection = this.getCurrentSection();
    const sectionContent = document.querySelector(`#section-${currentSection}`);

    if (sectionContent) {
      this.completedSections.add(currentSection);
      if (!this.formData.completedSections) {
        this.formData.completedSections = [];
      }
      if (!this.formData.completedSections.includes(currentSection)) {
        this.formData.completedSections.push(currentSection);
      }
    }

    this.saveFormData();
  }

  /**
   * Save all progress and show feedback
   */
  saveProgress() {
    this.saveProgressForSection();
    this.saveFormData();

    // Show success message
    this.showNotification('Progress saved successfully', 'success');
  }

  /**
   * Update section display
   */
  updateSectionDisplay() {
    // Hide all sections
    const allSections = document.querySelectorAll('.form-section');
    allSections.forEach(section => {
      section.classList.remove('active');
      section.style.display = 'none';
    });

    // Show current section with animation
    const currentSection = document.getElementById(`section-${this.getCurrentSection()}`);
    if (currentSection) {
      currentSection.style.display = 'block';
      // Trigger animation
      setTimeout(() => {
        currentSection.classList.add('active');
      }, 10);
    }

    // Update button states
    this.updateButtons();
    this.updateProgressSteps();
  }

  /**
   * Update navigation button visibility and state
   */
  updateButtons() {
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    const isLastSection = this.currentSectionIndex === this.sections.length - 1;

    if (backBtn) {
      backBtn.style.display = this.currentSectionIndex > 0 ? 'block' : 'none';
    }

    if (nextBtn) {
      nextBtn.textContent = isLastSection ? 'Submit & Complete →' : 'Next Section →';
    }
  }

  /**
   * Update progress indicator
   */
  updateProgress() {
    const percentComplete = Math.round((this.completedSections.size / this.sections.length) * 100);
    const percentElement = document.getElementById('percentComplete');
    const progressBarFill = document.querySelector('.progress-bar-fill');

    if (percentElement) {
      percentElement.textContent = percentComplete;
    }

    if (progressBarFill) {
      progressBarFill.style.width = `${percentComplete}%`;
    }

    this.updateProgressSteps();
  }

  /**
   * Update progress step indicator
   */
  updateProgressSteps() {
    const progressSteps = document.querySelectorAll('.progress-step');

    progressSteps.forEach((step, index) => {
      const section = this.sections[index];
      const isCompleted = this.completedSections.has(section);
      const isCurrent = index === this.currentSectionIndex;
      const isAccessible = index <= this.currentSectionIndex + 1;

      // Update classes
      step.classList.toggle('completed', isCompleted);
      step.classList.toggle('current', isCurrent);
      step.classList.toggle('accessible', isAccessible);

      // Update tabindex for accessibility
      step.setAttribute('tabindex', isAccessible ? '0' : '-1');

      // Update aria-label
      let ariaLabel = `Section ${index + 1}: ${this.formatSectionName(section)}`;
      if (isCompleted) ariaLabel += ', completed';
      if (isCurrent) ariaLabel += ', current';
      step.setAttribute('aria-label', ariaLabel);
    });
  }

  /**
   * Format section name for display
   */
  formatSectionName(section) {
    const names = {
      household: 'Household Profile',
      lifestyle: 'Lifestyle & Values',
      experience: 'Experience & Background',
      preferences: 'Adoption Preferences',
      legal: 'Legal Readiness'
    };
    return names[section] || section;
  }

  /**
   * Load form data from localStorage
   */
  loadFormData() {
    const saved = localStorage.getItem('havenlink_intake_form');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved form data:', e);
        return this.createEmptyFormData();
      }
    }
    return this.createEmptyFormData();
  }

  /**
   * Create empty form data structure
   */
  createEmptyFormData() {
    return {
      household: {},
      lifestyle: {},
      experience: {},
      preferences: {},
      legal: {},
      completedSections: [],
      lastSaved: null,
      startedAt: new Date().toISOString()
    };
  }

  /**
   * Save form data to localStorage
   */
  saveFormData() {
    this.formData.lastSaved = new Date().toISOString();
    this.formData.completedSections = Array.from(this.completedSections);

    try {
      localStorage.setItem('havenlink_intake_form', JSON.stringify(this.formData));
    } catch (e) {
      console.error('Failed to save form data:', e);
      this.showNotification('Failed to save progress. Please try again.', 'error');
    }
  }

  /**
   * Store form field data
   */
  setFieldData(section, fieldName, value) {
    if (!this.formData[section]) {
      this.formData[section] = {};
    }
    this.formData[section][fieldName] = value;
    this.saveFormData();
  }

  /**
   * Get form field data
   */
  getFieldData(section, fieldName) {
    if (this.formData[section] && this.formData[section][fieldName] !== undefined) {
      return this.formData[section][fieldName];
    }
    return null;
  }

  /**
   * Get all data for current section
   */
  getSectionData() {
    return this.formData[this.getCurrentSection()] || {};
  }

  /**
   * Check if there are unsaved changes
   */
  checkForChanges() {
    const form = document.getElementById('intakeForm');
    if (!form) return false;

    const inputs = form.querySelectorAll('input, textarea, select');
    for (let input of inputs) {
      if (input.value !== input.defaultValue) {
        return true;
      }
    }
    return false;
  }

  /**
   * Complete form submission
   */
  completeForm() {
    this.saveProgressForSection();
    this.showNotification('Form submitted successfully! Redirecting...', 'success');

    // TODO: Send to backend and redirect to results/matching page
    setTimeout(() => {
      window.location.href = 'agency-profiles.html';
    }, 2000);
  }

  /**
   * Clear all form data
   */
  clearFormData() {
    if (confirm('Are you sure you want to clear all form data? This cannot be undone.')) {
      localStorage.removeItem('havenlink_intake_form');
      this.formData = this.createEmptyFormData();
      this.completedSections = new Set();
      this.currentSectionIndex = 0;
      this.updateSectionDisplay();
      this.updateProgress();
      this.showNotification('Form data cleared', 'info');
    }
  }

  /**
   * Ensure accessibility features are in place
   */
  ensureAccessibility() {
    const form = document.getElementById('intakeForm');
    if (!form) return;

    // Set form role
    form.setAttribute('role', 'form');

    // Ensure all labels have proper associations
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach((input, index) => {
      if (!input.id) {
        input.id = `form-field-${index}`;
      }
      if (!input.getAttribute('aria-label') && input.previousElementSibling?.tagName === 'LABEL') {
        input.setAttribute('aria-label', input.previousElementSibling.textContent);
      }
    });

    // Set up section landmarks
    const sections = document.querySelectorAll('.form-section');
    sections.forEach((section, index) => {
      section.setAttribute('role', 'region');
      section.setAttribute('aria-label', `Section ${index + 1}: ${this.formatSectionName(section.dataset.section)}`);
    });
  }

  /**
   * Show notification message
   */
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Scroll to top of form
   */
  scrollToTop() {
    const formSection = document.querySelector('.form-section.active');
    if (formSection) {
      const offset = 140; // Account for sticky nav + subnav
      const elementPosition = formSection.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth'
      });
    }
  }
}

/**
 * Initialize form when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  window.intakeFormState = new IntakeFormState();
});

/**
 * Export for testing or reuse
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntakeFormState;
}
