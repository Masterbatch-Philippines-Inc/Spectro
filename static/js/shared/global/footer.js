
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