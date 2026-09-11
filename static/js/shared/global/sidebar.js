
export function initSidebarToggle() {
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!hamburger || !sidebar) return;

  const mq = window.matchMedia('(min-width: 768px)');

  function applyInitialMobileState() {
    if (mq.matches) {
      sidebar.style.transform = '';
    } else {
      sidebar.style.transform = 'translateX(-100%)';
    }
  }
  applyInitialMobileState();

  function closeMobileDrawer() {
    sidebar.style.transform = 'translateX(-100%)';
    sidebar.dataset.mobileOpen = 'false';
    if (backdrop) {
      backdrop.style.transition = 'opacity .3s ease-in-out';
      backdrop.style.opacity = '0';
      backdrop.style.pointerEvents = 'none';
      setTimeout(function () { backdrop.classList.add('hidden'); }, 300);
    }
    hamburger.classList.remove('is-closed');
  }

  function openMobileDrawer() {
    sidebar.classList.remove('hidden');
    sidebar.dataset.mobileOpen = 'true';
    if (backdrop) {
      backdrop.classList.remove('hidden');
      backdrop.style.transition = 'opacity .3s ease-in-out';
      backdrop.style.pointerEvents = '';
      backdrop.style.opacity = '0';
      requestAnimationFrame(function () {
        backdrop.style.opacity = '1';
      });
    }
    requestAnimationFrame(function () {
      sidebar.style.transform = 'translateX(0)';
    });
    hamburger.classList.add('is-closed');
  }

  hamburger.addEventListener('click', function () {
    if (mq.matches) {
      // desktop -- push/collapse behavior, unchanged
      sidebar.classList.toggle('collapsed');
      hamburger.classList.toggle('is-closed');
    } else {
      // mobile -- overlay drawer behavior
      const isOpen = sidebar.dataset.mobileOpen === 'true';
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
    sidebar.classList.remove('collapsed');
    if (backdrop) {
      backdrop.classList.add('hidden');
      backdrop.style.opacity = '';
      backdrop.style.pointerEvents = '';
    }
    hamburger.classList.remove('is-closed');
    applyInitialMobileState();
  });
}