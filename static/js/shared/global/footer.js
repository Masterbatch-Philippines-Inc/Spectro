
export function initFooterClock() {
  const el = document.getElementById('footerDate');
  if (!el) return;
  function tick() {
    const now = new Date();
    const dayStr = now.toLocaleDateString('en-US', { weekday: 'short' });
    const monthStr = now.toLocaleDateString('en-US', { month: 'short' });
    const dateNum = String(now.getDate()).padStart(2, '0');
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    el.textContent = dayStr + ', ' + monthStr + '. ' + dateNum + ' // ' + timeStr;
  }
  tick();
  setInterval(tick, 1000);
}

export function initDarkModeToggle() {
  const toggle = document.getElementById('darkModeToggle');
  if (!toggle) return;

  toggle.textContent = document.documentElement.classList.contains('dark') ? 'Try Light Mode' : 'Try Dark Mode';

  toggle.addEventListener('click', function (e) {
    e.preventDefault();
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    toggle.textContent = isDark ? 'Try Light Mode' : 'Try Dark Mode';0
  });
}