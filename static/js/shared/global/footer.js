
function initFooterClock() {
  const el = document.getElementById('footerDate');
  if (!el) return;
  function tick() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    el.textContent = 'Today is ' + dateStr + ', ' + timeStr;
  }
  tick();
  setInterval(tick, 1000);
}

function initDarkModeToggle() {
  const toggle = document.getElementById('darkModeToggle');
  if (!toggle) return;

  toggle.textContent = document.documentElement.classList.contains('dark') ? 'Try Light Mode' : 'Try Dark Mode';

  toggle.addEventListener('click', function (e) {
    e.preventDefault();
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    toggle.textContent = isDark ? 'Try Light Mode' : 'Try Dark Mode';
  });
}