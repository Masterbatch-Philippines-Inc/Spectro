
function initSidebarToggle() {
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  if (!hamburger || !sidebar) return;
  hamburger.addEventListener('click', function () {
    sidebar.classList.toggle('collapsed');
    hamburger.classList.toggle('is-closed');
  });
}
