
export function initSidebarToggle() {
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!hamburger || !sidebar) return;

  const mq = window.matchMedia('(min-width: 768px)');

  function closeMobileDrawer() {
    sidebar.classList.add('hidden');
    sidebar.classList.remove('flex');
    if (backdrop) backdrop.classList.add('hidden');
    hamburger.classList.remove('is-closed');
  }

  function openMobileDrawer() {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex');
    if (backdrop) backdrop.classList.remove('hidden');
    hamburger.classList.add('is-closed');
  }

  hamburger.addEventListener('click', function () {
    if (mq.matches) {
      // desktop -- push/collapse behavior, unchanged
      sidebar.classList.toggle('collapsed');
      hamburger.classList.toggle('is-closed');
    } else {
      // mobile -- overlay drawer behavior
      const isOpen = sidebar.classList.contains('flex');
      if (isOpen) closeMobileDrawer(); else openMobileDrawer();
    }
  });

  if (backdrop) {
    backdrop.addEventListener('click', closeMobileDrawer);
  }

  // switching breakpoints mid-session resets both modes cleanly so
  // neither the overlay drawer nor the desktop collapse state leaks
  // into the other layout
  mq.addEventListener('change', function () {
    closeMobileDrawer();
    sidebar.classList.remove('collapsed');
  });
}