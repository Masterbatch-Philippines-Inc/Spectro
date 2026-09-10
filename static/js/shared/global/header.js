
/* static/js/header.js
   Header bar behavior shared by every page (currently just a stub --
   extend as header interactions are added). */

export function initHeader() {
  // placeholder for future shared header interactions
}

export function initHeaderThemeToggle() {
  const toggle = document.getElementById('headerThemeToggle');
  if (!toggle) return;

  toggle.addEventListener('click', function () {
    const isDark = document.documentElement.classList.toggle('dark');
    try { sessionStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) {}
  });
}
