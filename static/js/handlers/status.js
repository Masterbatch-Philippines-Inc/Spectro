
/*
 *  static/js/handlers/status.js
 *
 *  Populates templates/handlers/status.html based on the status code
 *  Django rendered it with (see apps/spectro/modules/handlers.py).
 *  "Back to previous page" reads the last non-handler page visited,
 *  tracked in sessionStorage by app.js on every normal page load.
 */

const LAST_PAGE_SESSION_KEY = 'spectroLastVisitedPage';

const STATUS_CONFIG = {
  400: {
    headline: 'Bad Request',
    message: 'The request could not be understood by the server. Please try again.',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  },
  401: {
    headline: 'Unauthorized',
    message: 'You need to sign in to access this page.',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  },
  403: {
    headline: 'Access Forbidden',
    message: "You don't have permission to view this page.",
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>',
  },
  404: {
    headline: 'Page Not Found',
    message: "The page you're looking for doesn't exist or was moved.",
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  },
  500: {
    headline: 'Server Error',
    message: 'Something went wrong on our end. Please contact IT Administrator.',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
  },
  503: {
    headline: 'Service Unavailable',
    message: 'The system is currently down for maintenance. Please check back shortly.',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  },
};

const DEFAULT_CONFIG = {
  headline: 'Something Went Wrong',
  message: 'An unexpected error occurred.',
  icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

function getStatusCode() {
  const el = document.getElementById('statusCode');
  if (!el) return null;
  const raw = el.dataset.statusCode;
  return raw && !isNaN(parseInt(raw, 10)) ? parseInt(raw, 10) : raw;
}

function renderStatus() {
  const code = getStatusCode();
  const config = STATUS_CONFIG[code] || DEFAULT_CONFIG;

  const iconEl = document.getElementById('statusIcon');
  const headlineEl = document.getElementById('statusHeadline');
  const messageEl = document.getElementById('statusMessage');

  if (iconEl) iconEl.innerHTML = config.icon;
  if (headlineEl) headlineEl.innerHTML = (code && STATUS_CONFIG[code] ? '<div class="text-3xl font-extrabold mb-1">' + code + '</div>' : '') + config.headline;
  if (messageEl) messageEl.textContent = config.message;
}

function wireBackButton() {
  const backBtn = document.getElementById('statusBackBtn');
  if (!backBtn) return;

  backBtn.addEventListener('click', function () {
    window.location.href = '/';
  });
}

renderStatus();
wireBackButton();