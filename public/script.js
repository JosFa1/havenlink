// Mobile Menu Toggle
const PARTNERSHIP_BACKEND_DISABLED = true;
const PARTNERSHIP_BACKEND_DISABLED_MESSAGE =
  'Online submissions are temporarily paused while HavenLink reduces hosting costs. Please email havenlink.org@gmail.com and we will follow up directly.';

const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const navLinks = document.getElementById('navLinks');

mobileMenuToggle.addEventListener('click', () => {
  mobileMenuToggle.classList.toggle('active');
  navLinks.classList.toggle('active');
});

// Close mobile menu when a link is clicked
const navLinkElements = document.querySelectorAll('.nav-link');
navLinkElements.forEach(link => {
  link.addEventListener('click', () => {
    mobileMenuToggle.classList.remove('active');
    navLinks.classList.remove('active');
  });
});

// Sticky navbar styling on scroll
const navbar = document.getElementById('navbar');
let lastScrollTop = 0;

window.addEventListener('scroll', () => {
  let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  if (scrollTop > 100) {
    navbar.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
  } else {
    navbar.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
  }

  lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
});

// Intersection Observer for scroll animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe animated elements
document.querySelectorAll('.value-card, .step, .feature-card, .safety-item, .roadmap-card').forEach(el => {
  observer.observe(el);
});

// Smooth scroll for button clicks
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href !== '#' && document.querySelector(href)) {
      e.preventDefault();
      const target = document.querySelector(href);
      const navHeight = navbar.offsetHeight;
      const targetPosition = target.offsetTop - navHeight;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// Active nav link styling based on scroll position
window.addEventListener('scroll', () => {
  let current = '';
  const sections = document.querySelectorAll('section');

  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.clientHeight;
    if (pageYOffset >= sectionTop - 200) {
      current = section.getAttribute('id');
    }
  });

  navLinkElements.forEach(link => {
    link.classList.remove('active');
    // Some nav controls (e.g. the Adopt dropdown <button>) have no href.
    const href = link.getAttribute('href');
    if (href && href.slice(1) === current) {
      link.style.color = 'var(--blue)';
    } else {
      link.style.color = '';
    }
  });
});

// Add subtle parallax effect to hero section (only on pages that have a hero)
const heroEl = document.querySelector('.hero');
if (heroEl) {
  window.addEventListener('scroll', () => {
    const scrollPosition = window.pageYOffset;
    if (scrollPosition < 800) {
      heroEl.style.backgroundPosition = `50% ${scrollPosition * 0.5}px`;
    }
  });
}

// Button ripple effect
const buttons = document.querySelectorAll('.btn');
buttons.forEach(button => {
  button.addEventListener('click', function (e) {
    const ripple = document.createElement('span');
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');

    this.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  });
});

// Dynamic form validation (for future contact form)
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Performance: Lazy load SVG icons
const lazyLoadSVGs = () => {
  const svgs = document.querySelectorAll('svg');
  svgs.forEach(svg => {
    if (!svg.hasAttribute('viewBox')) {
      console.warn('SVG missing viewBox attribute:', svg);
    }
  });
};

document.addEventListener('DOMContentLoaded', lazyLoadSVGs);

// Accessibility: Announce navigation changes to screen readers
const announceNavigation = (message) => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.style.display = 'none';
  announcement.textContent = message;
  document.body.appendChild(announcement);

  setTimeout(() => announcement.remove(), 1000);
};

// Log page load for analytics (commented out for production)
// console.log('HavenLink homepage loaded successfully');

// Adopt Dropdown Menu Handling
const adoptDropdown = document.getElementById('adoptDropdown');
const adoptMenu = document.getElementById('adoptMenu');

if (adoptDropdown && adoptMenu) {
  // Toggle dropdown on click
  adoptDropdown.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isExpanded = adoptDropdown.getAttribute('aria-expanded') === 'true';
    adoptDropdown.setAttribute('aria-expanded', !isExpanded);
    adoptMenu.classList.toggle('active');
  });

  // Close dropdown when a menu item is clicked
  adoptMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      adoptDropdown.setAttribute('aria-expanded', 'false');
      adoptMenu.classList.remove('active');
      mobileMenuToggle.classList.remove('active');
      navLinks.classList.remove('active');
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!adoptDropdown.closest('.nav-dropdown').contains(e.target)) {
      adoptDropdown.setAttribute('aria-expanded', 'false');
      adoptMenu.classList.remove('active');
    }
  });

  // Handle keyboard navigation
  adoptMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      adoptDropdown.setAttribute('aria-expanded', 'false');
      adoptMenu.classList.remove('active');
      adoptDropdown.focus();
    }
  });
}

// Privacy Policy Modal Handling
document.addEventListener('DOMContentLoaded', () => {
  const privacyModal = document.getElementById('privacyModal');
  const privacyPolicyLinks = document.querySelectorAll('.privacy-policy-link, a[href="#privacy-policy"]');
  const privacyModalClose = document.getElementById('privacyModalClose');

  if (privacyModal) {
    // Open modal when clicking privacy policy link
    privacyPolicyLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        privacyModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    });

    // Close modal when clicking close button
    if (privacyModalClose) {
      privacyModalClose.addEventListener('click', () => {
        privacyModal.classList.remove('active');
        document.body.style.overflow = 'auto';
      });
    }

    // Close modal when clicking outside the modal content
    privacyModal.addEventListener('click', (e) => {
      if (e.target === privacyModal) {
        privacyModal.classList.remove('active');
        document.body.style.overflow = 'auto';
      }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && privacyModal.classList.contains('active')) {
        privacyModal.classList.remove('active');
        document.body.style.overflow = 'auto';
      }
    });
  }

  // Partnership Form Submission Handling
  const partnershipForm = document.getElementById('partnershipForm');
  if (partnershipForm) {
    const formMessage = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitBtn');
    if (PARTNERSHIP_BACKEND_DISABLED) {
      if (submitBtn) submitBtn.disabled = true;
      if (formMessage) {
        formMessage.style.display = 'block';
        formMessage.style.backgroundColor = '#eff6ff';
        formMessage.style.color = '#1e40af';
        formMessage.style.border = '1px solid #bfdbfe';
        formMessage.textContent = PARTNERSHIP_BACKEND_DISABLED_MESSAGE;
      }
      return;
    }

    partnershipForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const originalText = submitBtn.textContent;

      // Disable submit button and show loading state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        // Collect form data
        const formData = new FormData(partnershipForm);
        const data = Object.fromEntries(formData);

        // Send POST request to backend
        const response = await fetch('/api/partnership-request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
          // Success
          formMessage.style.display = 'block';
          formMessage.style.backgroundColor = '#d1fae5';
          formMessage.style.color = '#065f46';
          formMessage.style.border = '1px solid #6ee7b7';
          formMessage.textContent =
            'Thank you! Your partnership request has been submitted successfully. We will be in touch within 3-5 business days.';

          // Reset form
          partnershipForm.reset();

          // Scroll to message
          formMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Hide message after 5 seconds
          setTimeout(() => {
            formMessage.style.display = 'none';
          }, 5000);
        } else {
          // Error
          formMessage.style.display = 'block';
          formMessage.style.backgroundColor = '#fee2e2';
          formMessage.style.color = '#991b1b';
          formMessage.style.border = '1px solid #fca5a5';
          formMessage.textContent = result.error || 'Failed to submit partnership request. Please try again.';

          // Scroll to message
          formMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (error) {
        console.error('Error submitting partnership request:', error);
        formMessage.style.display = 'block';
        formMessage.style.backgroundColor = '#fee2e2';
        formMessage.style.color = '#991b1b';
        formMessage.style.border = '1px solid #fca5a5';
        formMessage.textContent = 'An error occurred. Please try again or contact us directly at havenlink.org@gmail.com';

        // Scroll to message
        formMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }
});
