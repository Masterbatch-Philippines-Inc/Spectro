
/*
 *  static/js/shared/global/theme-boot.js
 *
 *  Applies the stored dark-mode preference BEFORE first paint, to avoid
 *  a flash of the wrong theme. Deliberately loaded as a plain, blocking,
 *  non-module <script> in <head> -- NOT through base.js
 *  deferred module pipeline -- since by the time base.js runs, the page
 *  has already painted and the flash would already have happened.
 */
(function () {
  var stored = null;
  try { stored = sessionStorage.getItem('theme'); } catch (e) {}
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = stored ? stored === 'dark' : prefersDark;
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
})();