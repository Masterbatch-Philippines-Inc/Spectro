
/*
 *  Generic AJAX form submit helper.
 *  Any <form data-ajax-form> submits via fetch(); Django is expected to
 *  respond with JSON shaped like:
 *    {
 *      "tone": "success",
 *      "message": "Standard saved.",
 *      "redirect": "/optional/",
 *      "errors": { "cma_lot": "This field is required.", "dosage": "Must be numeric." }
 *    }
 *  tone must match a key in TOAST_TONE_CLASSES (toast.js): info | success | warning | danger
 *  "errors" is optional -- input-level problems render inline under the
 *  matching field (data-field-error="
 */

function initAjaxForms() {
  document.querySelectorAll('form[data-ajax-form]').forEach(function (form) {
    if (form.dataset.ajaxBound) return; // avoid double-binding on re-init
    form.dataset.ajaxBound = 'true';

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const toastStackId = form.dataset.toastStack || 'toastStack';

      fetch(form.action, {
        method: form.method || 'POST',
        body: new FormData(form),
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          const data = result.data || {};
          showToast(toastStackId, data.message || 'Something happened.', data.tone || (result.ok ? 'success' : 'danger'));

          if (result.ok && data.redirect) {
            window.location.href = data.redirect;
            return;
          }
          if (result.ok && form.dataset.resetOnSuccess !== 'false') {
            form.reset();
          }
        })
        .catch(function () {
          showToast(toastStackId, 'Network error — please try again.', 'danger');
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  });
}