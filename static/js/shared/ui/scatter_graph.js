
/*
 *  Generic scatter-graph render engine.
 *  Paints into #scatterPoints (sidebar) and #scatterPointsModal (modal),
 *  reading whatever window.getScatterPlotPoints() returns. That function
 *  is defined per-page (samples_record.html reads its dataset table;
 *  samples_reader.html reads its live wizard session) -- this file has
 *  zero knowledge of where the points came from.
 */

function paintScatterGroup(groupEl) {
  if (!groupEl) return;
  groupEl.innerHTML = '';
  if (typeof window.getScatterPlotPoints !== 'function') return;

  const cx = 95, cy = 90, scale = 85;
  const points = window.getScatterPlotPoints() || [];

  points.forEach(function (pt) {
    if (pt.da === null || pt.db === null || pt.da === undefined || pt.db === undefined) return;
    const x = cx + Math.max(-1, Math.min(1, pt.da)) * scale;
    const y = cy - Math.max(-1, Math.min(1, pt.db)) * scale;

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
    dot.setAttribute('r', pt.passed ? 2.4 : 3);
    dot.setAttribute('fill', pt.passed ? 'hsl(var(--muted-foreground))' : 'hsl(var(--danger))');
    dot.setAttribute('opacity', pt.passed ? '0.6' : '0.95');
    dot.style.cursor = 'pointer';

    dot.addEventListener('mouseenter', function (e) { showScatterTooltip(e, pt); });
    dot.addEventListener('mousemove', moveScatterTooltip);
    dot.addEventListener('mouseleave', hideScatterTooltip);

    groupEl.appendChild(dot);
  });
}

function showScatterTooltip(evt, pt) {
  const tooltip = document.getElementById('scatterTooltip');
  if (!tooltip) return;
  tooltip.innerHTML = '<div class="font-semibold">' + pt.name + '</div>'
    + '<div>Δa*: ' + pt.da.toFixed(2) + '</div>'
    + '<div>Δb*: ' + pt.db.toFixed(2) + '</div>';
  tooltip.classList.remove('hidden');
  moveScatterTooltip(evt);
}

function moveScatterTooltip(evt) {
  const tooltip = document.getElementById('scatterTooltip');
  if (!tooltip) return;
  tooltip.style.left = (evt.clientX + 12) + 'px';
  tooltip.style.top = (evt.clientY + 12) + 'px';
}

function hideScatterTooltip() {
  const tooltip = document.getElementById('scatterTooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

export function renderScatter() {
  paintScatterGroup(document.getElementById('scatterPoints'));
  paintScatterGroup(document.getElementById('scatterPointsModal'));
}

export function initScatterGraph() {
  renderScatter();

  // repaint the modal copy every time its modal opens, so it reflects
  // whatever's changed in the sidebar copy since last open
  document.addEventListener('modal:opened', function (e) {
    if (e.detail && e.detail.modalId === 'scatterModal') {
      paintScatterGroup(document.getElementById('scatterPointsModal'));
    }
  });
}