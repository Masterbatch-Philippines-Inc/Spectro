/*
 *  static/js/shared/utils/csrf.js
 *
 *  Reads Django's CSRF token directly from the csrftoken cookie
 *  (set automatically by CsrfViewMiddleware) instead of relying on a
 *  {% csrf_token %} hidden input in the DOM. This is Django's own
 *  documented pattern for AJAX requests -- see:
 *  https://docs.djangoproject.com/en/stable/howto/csrf/
 */

export function getCsrfToken() {
  const name = 'csrftoken=';
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith(name)) {
      return decodeURIComponent(cookie.slice(name.length));
    }
  }
  return '';
}