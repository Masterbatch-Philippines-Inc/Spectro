
/*
 *  Generic modal open/close system.
 *  Open trigger:  any element with data-modal-target="<modalId>"
 *  Modal root:    div[data-modal="<modalId>"]
 *  Close trigger: any element inside the modal with data-modal-close,
 *                 or clicking the overlay backdrop itself
 *
 *  Dispatches "modal:opened" / "modal:closed" CustomEvents on document
 *  (detail: { modalId }) so other components (e.g. scatter_graph.js)
 *  can react without modal.js knowing about them.
 */

function openModal(modalId) {
  const modal = document.querySelector('[data-modal="' + modalId + '"]');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.dispatchEvent(new CustomEvent('modal:opened', { detail: { modalId: modalId } }));
}

function closeModal(modalId) {
  const modal = document.querySelector('[data-modal="' + modalId + '"]');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.dispatchEvent(new CustomEvent('modal:closed', { detail: { modalId: modalId } }));
}

function initModals() {
  document.querySelectorAll('[data-modal-target]').forEach(function (trigger) {
    if (trigger.dataset.modalBound) return;
    trigger.dataset.modalBound = 'true';
    trigger.addEventListener('click', function () {
      openModal(trigger.dataset.modalTarget);
    });
  });

  document.querySelectorAll('[data-modal]').forEach(function (modal) {
    if (modal.dataset.modalBound) return;
    modal.dataset.modalBound = 'true';

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal(modal.dataset.modal);
    });

    modal.querySelectorAll('[data-modal-close]').forEach(function (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeModal(modal.dataset.modal);
      });
    });
  });
}