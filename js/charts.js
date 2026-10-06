/*
 * Gráficos em SVG puro (barras e linha), com tooltip ao passar o mouse/tocar.
 * Cores chegam como variáveis CSS (ex.: 'var(--g-700)').
 */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const text = (f, x, y, s, cls, anchor = 'middle', style = '') =>
    (svgEl('text', { x, y, 'text-anchor': anchor, class: cls, style }, f.svg).textContent = s);

  function niceScale(max) {
    if (!(max > 0)) max = 1;
    const raw = max / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    const n = raw / p;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
    return { top, ticks };
  }

  function frame(container, o) {
    container.innerHTML = '';
    container.classList.add('chart');
    const wrap = document.createElement('div');
    wrap.className = 'chart-plot';
    container.appendChild(wrap);
    const W = Math.max(260, wrap.clientWidth);
    const H = o.height || 260;
    const m = {
      l: o.axis === false ? 2 : (o.marginLeft || 48),
      r: o.marginRight || 8,
      t: o.marker ? 30 : o.valueLabels ? 22 : 14,
      b: o.xTitle ? 48 : 28,
    };
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.ariaLabel || '' }, wrap);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    wrap.appendChild(tip);
    const f = { svg, tip, W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b };
    if (o.xTitle) text(f, m.l, H - 6, o.xTitle, 'axis-title', 'start');
    return f;
  }

  function yAxis(f, top, ticks, fmt) {
    for (const t of ticks) {
      const y = f.m.t + f.ih - (t / top) * f.ih;
      svgEl('line', { x1: f.m.l, x2: f.W - f.m.r, y1: y, y2: y, class: t === 0 ? 'baseline' : 'grid' }, f.svg);
      text(f, f.m.l - 10, y + 4, fmt(t), 'tick', 'end');
    }
  }

  function xLabels(f, xs, labels, o) {
    const y = f.m.t + f.ih + 18;
    if (o.xTicks) {
      o.xTicks.forEach(i => text(f, xs(i), y, labels[i], 'tick'));
      return;
    }
    const step = Math.ceil(labels.length / Math.max(2, Math.floor(f.iw / 46)));
    labels.forEach((l, i) => {
      if (i % step || !l) return;
      text(f, xs(i), y, l, i === o.boldIndex ? 'tick tick-bold' : 'tick');
    });
  }

  function showTip(f, html, x, y) {
    f.tip.innerHTML = html;
    f.tip.hidden = false;
    const tw = f.tip.offsetWidth, th = f.tip.offsetHeight;
    let left = x + 14;
    if (left + tw > f.W) left = x - 14 - tw;
    f.tip.style.left = Math.max(0, left) + 'px';
    f.tip.style.top = Math.max(0, y - th - 10) + 'px';
  }

  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /*
   * o: { labels, values, color (string ou fn(i)), ghost: [total previsto ou null],
   *      axis, valueLabels, valueFormat, marker: {index, label}, xTicks, boldIndex, yFormat, tip(i) }
   */
  function bar(container, o) {
    const f = frame(container, o);
    const n = o.labels.length;
    const vals = o.values;
    const ghost = o.ghost || [];
    const max = Math.max(...vals.map(v => v || 0), ...ghost.map(v => v || 0));
    const { top, ticks } = niceScale(max * 1.02);
    const Y = v => f.m.t + f.ih - (v / top) * f.ih;
    const base = f.m.t + f.ih;
    if (o.axis === false) svgEl('line', { x1: f.m.l, x2: f.W - f.m.r, y1: base, y2: base, class: 'baseline' }, f.svg);
    else yAxis(f, top, ticks, o.yFormat);

    const band = f.iw / n;
    const bw = Math.min(band * (n > 16 ? 0.72 : 0.84), 90);
    const xc = i => f.m.l + i * band + band / 2;
    const vf = o.valueFormat || (v => String(Math.round(v)));
    const marks = [];

    for (let i = 0; i < n; i++) {
      const x = xc(i) - bw / 2;
      if (ghost[i] != null) {
        const y = Y(ghost[i]);
        svgEl('rect', { x: x + 0.5, y, width: bw - 1, height: base - y, rx: 3, class: 'ghost' }, f.svg);
        if (o.valueLabels) text(f, xc(i), y - 7, vf(ghost[i]), 'vlabel vlabel-ghost');
      }
      const v = vals[i];
      if (v > 0) {
        const y = Y(v);
        const c = typeof o.color === 'function' ? o.color(i) : o.color;
        const p = svgEl('path', { d: barPath(x, y, bw, base - y, 3), class: 'bar', style: `fill:${c}` }, f.svg);
        marks.push({ i, p, y: ghost[i] != null ? Y(ghost[i]) : y });
        if (o.valueLabels && ghost[i] == null) text(f, xc(i), y - 7, vf(v), 'vlabel');
      }
    }

    if (o.marker) {
      const x = f.m.l + o.marker.index * band;
      svgEl('line', { x1: x, x2: x, y1: 6, y2: base, class: 'marker' }, f.svg);
      text(f, x + 5, 14, o.marker.label, 'marker-label', 'start');
    }
    xLabels(f, xc, o.labels, o);

    for (let i = 0; i < n; i++) {
      const hit = svgEl('rect', { x: f.m.l + i * band, y: 0, width: band, height: f.H, class: 'hit' }, f.svg);
      const enter = () => {
        marks.forEach(m => m.p.classList.toggle('dim', m.i !== i));
        const own = marks.find(m => m.i === i);
        showTip(f, o.tip(i), xc(i), own ? own.y : base);
      };
      hit.addEventListener('pointerenter', enter);
      hit.addEventListener('pointerdown', enter);
      hit.addEventListener('pointerleave', () => {
        marks.forEach(m => m.p.classList.remove('dim'));
        f.tip.hidden = true;
      });
    }
  }

  /*
   * o: { labels, series:[{color, values, dashed}], band:{lo,hi,color}, refLine:{value,label,color},
   *      points:[{i, v, color, label, dx, dy, anchor}], xTicks, xTitle, yFormat, tip(i) }
   */
  function line(container, o) {
    const f = frame(container, o);
    const n = o.labels.length;
    let max = 0;
    for (const s of o.series) for (const v of s.values) if (v != null) max = Math.max(max, v);
    if (o.band) for (const v of o.band.hi) if (v != null) max = Math.max(max, v);
    if (o.refLine) max = Math.max(max, o.refLine.value * 1.08);
    const { top, ticks } = niceScale(max * 1.04);
    yAxis(f, top, ticks, o.yFormat);
    const X = i => f.m.l + 8 + (n <= 1 ? 0 : (i / (n - 1)) * (f.iw - 16));
    const Y = v => f.m.t + f.ih - (v / top) * f.ih;
    xLabels(f, X, o.labels, o);

    if (o.band) {
      const idx = o.band.hi.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0);
      if (idx.length) {
        const d = idx.map((i, k) => `${k ? 'L' : 'M'}${X(i)},${Y(o.band.hi[i])}`).join('')
          + idx.slice().reverse().map(i => `L${X(i)},${Y(o.band.lo[i])}`).join('') + 'Z';
        svgEl('path', { d, class: 'band', style: `fill:${o.band.color}` }, f.svg);
      }
    }
    if (o.refLine) {
      const y = Y(o.refLine.value);
      svgEl('line', { x1: f.m.l, x2: f.W - f.m.r, y1: y, y2: y, class: 'ref', style: `stroke:${o.refLine.color}` }, f.svg);
      text(f, f.m.l + 8, y - 8, o.refLine.label, 'ref-label', 'start', `fill:${o.refLine.color}`);
    }
    for (const s of o.series) {
      const idx = s.values.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0);
      if (!idx.length) continue;
      const d = idx.map((i, k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(s.values[i]).toFixed(1)}`).join('');
      svgEl('path', { d, class: 'line' + (s.dashed ? ' dashed' : ''), style: `stroke:${s.color}` }, f.svg);
    }
    for (const p of o.points || []) {
      svgEl('circle', { cx: X(p.i), cy: Y(p.v), r: 6, class: 'point', style: `fill:${p.color}` }, f.svg);
      if (p.label) text(f, X(p.i) + (p.dx || 0), Y(p.v) + (p.dy || 0), p.label, 'point-label', p.anchor || 'start', p.labelColor ? `fill:${p.labelColor}` : '');
    }

    const cross = svgEl('line', { class: 'crosshair', y1: f.m.t, y2: f.m.t + f.ih, visibility: 'hidden' }, f.svg);
    const hit = svgEl('rect', { x: f.m.l, y: 0, width: f.iw, height: f.H, class: 'hit' }, f.svg);
    const move = ev => {
      const rect = f.svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - rect.left - f.m.l - 8) / (f.iw - 16)) * (n - 1))));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      const ys = o.series.map(s => s.values[i]).filter(v => v != null).map(Y);
      showTip(f, o.tip(i), X(i), ys.length ? Math.min(...ys) : f.m.t + f.ih / 2);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      f.tip.hidden = true;
    });
  }

  return { bar, line };
})();
