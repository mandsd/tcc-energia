/*
 * Gráficos em SVG puro (linha e barras), com tooltip ao passar o mouse/tocar.
 * Cores chegam como variáveis CSS (ex.: 'var(--s1)') para seguir o tema claro/escuro.
 */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

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
    if (o.legend) {
      const lg = document.createElement('div');
      lg.className = 'legend';
      lg.innerHTML = o.legend
        .map(l => `<span class="lg-item"><i class="sw ${l.kind || ''}" style="--c:${l.color}"></i>${l.name}</span>`)
        .join('');
      container.appendChild(lg);
    }
    const wrap = document.createElement('div');
    wrap.className = 'chart-plot';
    container.appendChild(wrap);
    const W = Math.max(260, wrap.clientWidth);
    const H = o.height || 260;
    const m = { l: o.marginLeft || 52, r: 14, t: 14, b: 28 };
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.ariaLabel || '' }, wrap);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    wrap.appendChild(tip);
    return { svg, tip, W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b };
  }

  function yAxis(f, top, ticks, fmt) {
    const g = svgEl('g', {}, f.svg);
    for (const t of ticks) {
      const y = f.m.t + f.ih - (t / top) * f.ih;
      svgEl('line', { x1: f.m.l, x2: f.W - f.m.r, y1: y, y2: y, class: t === 0 ? 'baseline' : 'grid' }, g);
      svgEl('text', { x: f.m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, g).textContent = fmt(t);
    }
  }

  function xLabels(f, items) {
    const maxN = Math.max(2, Math.floor(f.iw / 46));
    const step = Math.ceil(items.length / maxN);
    const g = svgEl('g', {}, f.svg);
    items.forEach((it, i) => {
      if (i % step || !it.text) return;
      svgEl('text', { x: it.x, y: f.H - 8, 'text-anchor': 'middle', class: 'tick' }, g).textContent = it.text;
    });
  }

  function refLine(f, y, label) {
    svgEl('line', { x1: f.m.l, x2: f.W - f.m.r, y1: y, y2: y, class: 'ref' }, f.svg);
    svgEl('text', { x: f.W - f.m.r, y: y - 6, 'text-anchor': 'end', class: 'ref-label' }, f.svg).textContent = label;
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

  /* o: { labels, series:[{name,color,values,dashed,area}], band:{lo,hi,color}, refLine:{value,label}, yFormat, tip(i) } */
  function line(container, o) {
    const f = frame(container, o);
    const n = o.labels.length;
    let max = 0;
    for (const s of o.series) for (const v of s.values) if (v != null) max = Math.max(max, v);
    if (o.band) for (const v of o.band.hi) if (v != null) max = Math.max(max, v);
    if (o.refLine) max = Math.max(max, o.refLine.value);
    const { top, ticks } = niceScale(max * 1.04);
    yAxis(f, top, ticks, o.yFormat);
    const X = i => f.m.l + (n <= 1 ? f.iw / 2 : (i / (n - 1)) * f.iw);
    const Y = v => f.m.t + f.ih - (v / top) * f.ih;
    xLabels(f, o.labels.map((t, i) => ({ x: X(i), text: t })));

    if (o.band) {
      const idx = o.band.hi.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0);
      if (idx.length) {
        const d = idx.map((i, k) => `${k ? 'L' : 'M'}${X(i)},${Y(o.band.hi[i])}`).join('')
          + idx.slice().reverse().map(i => `L${X(i)},${Y(o.band.lo[i])}`).join('') + 'Z';
        svgEl('path', { d, class: 'band', style: `fill:${o.band.color}` }, f.svg);
      }
    }

    for (const s of o.series) {
      const idx = s.values.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0);
      if (!idx.length) continue;
      const d = idx.map((i, k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(s.values[i]).toFixed(1)}`).join('');
      if (s.area) {
        const base = f.m.t + f.ih;
        svgEl('path', { d: `${d}L${X(idx[idx.length - 1])},${base}L${X(idx[0])},${base}Z`, class: 'area', style: `fill:${s.color}` }, f.svg);
      }
      svgEl('path', { d, class: 'line' + (s.dashed ? ' dashed' : ''), style: `stroke:${s.color}` }, f.svg);
    }
    if (o.refLine) refLine(f, Y(o.refLine.value), o.refLine.label);

    const cross = svgEl('line', { class: 'crosshair', y1: f.m.t, y2: f.m.t + f.ih, visibility: 'hidden' }, f.svg);
    const dots = o.series.map(s => svgEl('circle', { r: 4.5, class: 'dot', style: `fill:${s.color}`, visibility: 'hidden' }, f.svg));
    const hit = svgEl('rect', { x: f.m.l - 6, y: 0, width: f.iw + 12, height: f.H, class: 'hit' }, f.svg);

    const move = ev => {
      const rect = f.svg.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - f.m.l) / f.iw) * (n - 1))));
      const x = X(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      let ymin = f.m.t + f.ih;
      o.series.forEach((s, k) => {
        const v = s.values[i];
        if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
        const y = Y(v);
        ymin = Math.min(ymin, y);
        dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', y); dots[k].setAttribute('visibility', 'visible');
      });
      showTip(f, o.tip(i), x, ymin);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      dots.forEach(d => d.setAttribute('visibility', 'hidden'));
      f.tip.hidden = true;
    });
  }

  /* o: { labels, series:[{name,color (string ou fn(i)),values}], refLine, yFormat, tip(i) } */
  function bar(container, o) {
    const f = frame(container, o);
    const n = o.labels.length;
    const S = o.series;
    let max = 0;
    S.forEach(s => s.values.forEach(v => { if (v != null) max = Math.max(max, v); }));
    if (o.refLine) max = Math.max(max, o.refLine.value);
    const { top, ticks } = niceScale(max * 1.04);
    yAxis(f, top, ticks, o.yFormat);
    const Y = v => f.m.t + f.ih - (v / top) * f.ih;
    const band = f.iw / n;
    const groupW = Math.min(band * 0.72, S.length * 36 + (S.length - 1) * 2);
    const bw = (groupW - (S.length - 1) * 2) / S.length;
    const marks = [];

    for (let i = 0; i < n; i++) {
      const gx = f.m.l + i * band + (band - groupW) / 2;
      S.forEach((s, k) => {
        const v = s.values[i];
        if (v == null || v <= 0) return;
        const y = Y(v);
        const c = typeof s.color === 'function' ? s.color(i) : s.color;
        const p = svgEl('path', { d: barPath(gx + k * (bw + 2), y, bw, f.m.t + f.ih - y, 4), class: 'bar', style: `fill:${c}` }, f.svg);
        marks.push({ i, p, y });
      });
    }
    xLabels(f, o.labels.map((t, i) => ({ x: f.m.l + i * band + band / 2, text: t })));
    if (o.refLine) refLine(f, Y(o.refLine.value), o.refLine.label);

    for (let i = 0; i < n; i++) {
      const hit = svgEl('rect', { x: f.m.l + i * band, y: 0, width: band, height: f.H, class: 'hit' }, f.svg);
      const enter = () => {
        const own = marks.filter(m => m.i === i);
        marks.forEach(m => m.p.classList.toggle('dim', m.i !== i));
        const y = own.length ? Math.min(...own.map(m => m.y)) : f.m.t + f.ih;
        showTip(f, o.tip(i), f.m.l + i * band + band / 2, y);
      };
      hit.addEventListener('pointerenter', enter);
      hit.addEventListener('pointerdown', enter);
      hit.addEventListener('pointerleave', () => {
        marks.forEach(m => m.p.classList.remove('dim'));
        f.tip.hidden = true;
      });
    }
  }

  return { line, bar };
})();
