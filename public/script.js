// Mobile Menu Toggle
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
    if (link.getAttribute('href').slice(1) === current) {
      link.style.color = 'var(--blue)';
    } else {
      link.style.color = '';
    }
  });
});

// Add subtle parallax effect to hero section
const heroScroll = () => {
  const hero = document.querySelector('.hero');
  const scrollPosition = window.pageYOffset;

  if (scrollPosition < 800) {
    hero.style.backgroundPosition = `50% ${scrollPosition * 0.5}px`;
  }
};

window.addEventListener('scroll', heroScroll);

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

// Adopt dropdown toggle (mobile tap) and outside click
const adoptToggle = document.querySelector('.adopt-toggle');
if (adoptToggle) {
  const adoptMenu = adoptToggle.closest('.adopt-menu');
  adoptToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = adoptToggle.getAttribute('aria-expanded') === 'true';
    adoptToggle.setAttribute('aria-expanded', String(!expanded));
    adoptMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!adoptMenu.contains(e.target)) {
      adoptMenu.classList.remove('open');
      adoptToggle.setAttribute('aria-expanded', 'false');
    }
  });

  const adoptLinks = adoptMenu.querySelectorAll('.adopt-dropdown a');
  adoptLinks.forEach(a => a.addEventListener('click', () => {
    adoptMenu.classList.remove('open');
    adoptToggle.setAttribute('aria-expanded', 'false');
    mobileMenuToggle.classList.remove('active');
    navLinks.classList.remove('active');
  }));
}

// Log page load for analytics (commented out for production)
// console.log('HavenLink homepage loaded successfully');
