/*
 *  static/js/shared/ui/tooltip.js
 *
 *  Generic hover-tooltip system. Any element anywhere on the page with
 *  a data-tooltip="..." attribute gets a floating tooltip near the
 *  cursor on hover -- no per-element JS wiring needed.
 *
 *  Uses event delegation on document (mouseover/mouseout, since
 *  mouseenter/mouseleave don't bubble) so this works identically for
 *  static markup and for rows/cells rendered later by table.js -- no
 *  re-binding required after a re-render, unlike per-element listeners.
 */

let boundOnce = false;

function findTooltipTarget(el) {
  return el && el.closest ? el.closest('[data-tooltip]') : null;
}

function showTooltip(target, evt) {
  const tooltip = document.getElementById('uiTooltip');
  if (!tooltip) return;
  const text = target.getAttribute('data-tooltip');
  if (!text) return;
  tooltip.textContent = text;
  tooltip.classList.remove('hidden');
  moveTooltip(evt);
}

function moveTooltip(evt) {
  const tooltip = document.getElementById('uiTooltip');
  if (!tooltip || tooltip.classList.contains('hidden')) return;
  tooltip.style.left = (evt.clientX + 12) + 'px';
  tooltip.style.top = (evt.clientY + 12) + 'px';
}

function hideTooltip() {
  const tooltip = document.getElementById('uiTooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

export function initTooltips() {
  if (boundOnce) return; // event delegation is global -- only ever bind once
  boundOnce = true;

  document.addEventListener('mouseover', function (e) {
    const target = findTooltipTarget(e.target);
    if (!target) return;
    // avoid re-triggering while moving between child elements of the
    // same tooltip target
    if (target.contains(e.relatedTarget)) return;
    showTooltip(target, e);
  });

  document.addEventListener('mousemove', function (e) {
    const target = findTooltipTarget(e.target);
    if (target) moveTooltip(e);
  });

  document.addEventListener('mouseout', function (e) {
    const target = findTooltipTarget(e.target);
    if (!target) return;
    // only hide once the cursor actually leaves the tooltip target
    // (not just moving between its own child nodes)
    if (target.contains(e.relatedTarget)) return;
    hideTooltip();
  });
}