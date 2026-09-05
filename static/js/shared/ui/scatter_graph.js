
/*
 *  Generic scatter-graph render engine.
 *  Paints into #scatterPoints (sidebar) and #scatterPointsModal (modal),
 *  reading whatever window.getScatterPlotPoints() returns. That function
 *  is defined per-page (samples_record.html reads its dataset table;
 *  samples_reader.html reads its live wizard session) -- this file has
 *  zero knowledge of where the points came from.
 *
 *  Axis range auto-scales to the data instead of a fixed -1..1: the
 *  furthest point from zero (on either axis) sets the range, then a
 *  padding factor is applied so that point never sits flush against
 *  the plot's edge. Falls back to a plain -1..1 range with no data.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Plot area in viewBox units -- same box the old hardcoded markup used.
const PLOT = { left: 10, right: 180, top: 20, bottom: 160 };
const CENTER_X = (PLOT.left + PLOT.right) / 2;
const CENTER_Y = (PLOT.top + PLOT.bottom) / 2;
const HALF_SPAN_X = (PLOT.right - PLOT.left) / 2;
const HALF_SPAN_Y = (PLOT.bottom - PLOT.top) / 2;

const PADDING_FACTOR = 1.25; // headroom beyond the furthest point
const MIN_RANGE = 1;         // never zoom in tighter than -1..1

// Picks a "nice" round number at or above `value` (1/2/5 * 10^n family)
// so gridline labels read like 1, 1.5, 2, 2.5, 5, 10 instead of 1.37.
function niceRoundUp(value) {
  if (value <= 0) return MIN_RANGE;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const fraction = value / base;
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * base;
}

function computeRange(points) {
  let maxAbs = 0;
  points.forEach(function (pt) {
    if (pt.da === null || pt.da === undefined || pt.db === null || pt.db === undefined) return;
    maxAbs = Math.max(maxAbs, Math.abs(pt.da), Math.abs(pt.db));
  });
  if (maxAbs === 0) return MIN_RANGE;
  return Math.max(MIN_RANGE, niceRoundUp(maxAbs * PADDING_FACTOR));
}

function toSvgX(value, range) {
  return CENTER_X + (Math.max(-range, Math.min(range, value)) / range) * HALF_SPAN_X;
}

function toSvgY(value, range) {
  return CENTER_Y - (Math.max(-range, Math.min(range, value)) / range) * HALF_SPAN_Y;
}

function formatTick(value) {
  // trims to at most 2 decimals, no trailing zeros (e.g. 2.5, not 2.50; 1, not 1.00)
  return parseFloat(value.toFixed(2)).toString();
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
  return el;
}

function drawAxis(axisGroup, range) {
  if (!axisGroup) return;
  axisGroup.innerHTML = '';

  const ticks = [-range, -range / 2, 0, range / 2, range];

  // outer border
  axisGroup.appendChild(svgEl('line', { x1: PLOT.left, y1: PLOT.top, x2: PLOT.left, y2: PLOT.bottom, stroke: 'hsl(var(--border))', 'stroke-width': '1' }));
  axisGroup.appendChild(svgEl('line', { x1: CENTER_X, y1: PLOT.top, x2: CENTER_X, y2: PLOT.bottom, stroke: 'hsl(var(--border))', 'stroke-width': '1' }));
  axisGroup.appendChild(svgEl('line', { x1: PLOT.left, y1: PLOT.top, x2: PLOT.right, y2: PLOT.top, stroke: 'hsl(var(--border))', 'stroke-width': '1' }));
  axisGroup.appendChild(svgEl('line', { x1: PLOT.left, y1: CENTER_Y, x2: PLOT.right, y2: CENTER_Y, stroke: 'hsl(var(--border))', 'stroke-width': '1' }));
  axisGroup.appendChild(svgEl('line', { x1: PLOT.left, y1: PLOT.bottom, x2: PLOT.right, y2: PLOT.bottom, stroke: 'hsl(var(--border))', 'stroke-width': '1' }));

  // zero axes, drawn heavier on top
  axisGroup.appendChild(svgEl('line', { x1: PLOT.left, y1: CENTER_Y, x2: PLOT.right, y2: CENTER_Y, stroke: 'hsl(var(--foreground))', 'stroke-width': '1.4' }));
  axisGroup.appendChild(svgEl('line', { x1: CENTER_X, y1: PLOT.top, x2: CENTER_X, y2: PLOT.bottom, stroke: 'hsl(var(--foreground))', 'stroke-width': '1.4' }));

  // x-axis tick labels (Δb*, bottom)
  ticks.forEach(function (t) {
    const label = svgEl('text', {
      x: toSvgX(t, range).toFixed(1), y: PLOT.bottom + 12,
      'font-size': '7', fill: 'hsl(var(--muted-foreground))', 'text-anchor': 'middle',
    });
    label.textContent = formatTick(t);
    axisGroup.appendChild(label);
  });

  // y-axis tick labels (Δa*, left) -- skip 0 here, already drawn by x-axis's own 0 tick above at bottom; keep top/center/bottom for y
  [range, 0, -range].forEach(function (t) {
    const label = svgEl('text', {
      x: PLOT.left - 6, y: (toSvgY(t, range) + 3).toFixed(1),
      'font-size': '7', fill: 'hsl(var(--muted-foreground))', 'text-anchor': 'middle',
    });
    label.textContent = formatTick(t);
    axisGroup.appendChild(label);
  });

  const xAxisTitle = svgEl('text', {
    x: CENTER_X, y: PLOT.top - 6,
    'font-size': '8', 'font-weight': '700', fill: 'hsl(var(--foreground))', 'text-anchor': 'middle',
  });
  xAxisTitle.textContent = 'Δa*';
  axisGroup.appendChild(xAxisTitle);

  const yAxisTitle = svgEl('text', {
    x: -60, y: 212,
    'font-size': '8', 'font-weight': '700', fill: 'hsl(var(--foreground))', 'text-anchor': 'start',
    transform: 'rotate(-90 6 30)',
  });
  yAxisTitle.textContent = 'Δb*';
  axisGroup.appendChild(yAxisTitle);
}

function paintScatterGroup(axisGroup, pointsGroup, points, range) {
  if (!pointsGroup) return;
  pointsGroup.innerHTML = '';

  drawAxis(axisGroup, range);

  points.forEach(function (pt) {
    if (pt.da === null || pt.db === null || pt.da === undefined || pt.db === undefined) return;
    const x = toSvgX(pt.da, range);
    const y = toSvgY(pt.db, range);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
    dot.setAttribute('r', pt.passed ? 2.4 : 3);
    dot.setAttribute('fill', pt.passed ? 'hsl(var(--muted-foreground))' : 'hsl(var(--danger))');
    dot.setAttribute('opacity', pt.passed ? '0.6' : '0.95');
    dot.style.cursor = 'pointer';

    dot.addEventListener('mouseenter', function (e) { showScatterTooltip(e, pt); });
    dot.addEventListener('mousemove', moveScatterTooltip);
    dot.addEventListener('mouseleave', hideScatterTooltip);

    pointsGroup.appendChild(dot);
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
  const points = (typeof window.getScatterPlotPoints === 'function') ? (window.getScatterPlotPoints() || []) : [];
  const range = computeRange(points);

  paintScatterGroup(document.getElementById('scatterAxis'), document.getElementById('scatterPoints'), points, range);
  paintScatterGroup(document.getElementById('scatterAxisModal'), document.getElementById('scatterPointsModal'), points, range);
}

export function initScatterGraph() {
  renderScatter();

  // repaint the modal copy every time its modal opens, so it reflects
  // whatever's changed in the sidebar copy since last open
  document.addEventListener('modal:opened', function (e) {
    if (e.detail && e.detail.modalId === 'scatterModal') {
      const points = (typeof window.getScatterPlotPoints === 'function') ? (window.getScatterPlotPoints() || []) : [];
      const range = computeRange(points);
      paintScatterGroup(document.getElementById('scatterAxisModal'), document.getElementById('scatterPointsModal'), points, range);
    }
  });
}