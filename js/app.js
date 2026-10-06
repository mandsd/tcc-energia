/* Telas, roteamento por hash (#painel, #historico, ...) e atualização em tempo real. */

const $ = (s, r = document) => r.querySelector(s);
const sum = a => a.reduce((s, v) => s + v, 0);
const nf = (v, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v, d = 1) => `${nf(v * 100, d)}%`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const mesCurto = k => { const [y, m] = k.split('-'); return `${MESES[m - 1].slice(0, 3)}/${y.slice(2)}`; };
const mesLongo = k => { const [y, m] = k.split('-'); return `${MESES[m - 1]} de ${y}`; };
const mesNome = k => MESES[k.split('-')[1] - 1];
const dataCurta = k => { const [, m, d] = k.split('-'); return `${d}/${m}`; };
const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const fatKwh = m => Faturas.all()[m.mes] ?? m.kwh_fatura;
const corDe = disp => id => `var(--s${disp.findIndex(d => d.id === id) + 1})`;

/* ---------- infraestrutura das telas ---------- */

let redraws = new Map();
let timers = [];

function chart(key, fn) { fn(); redraws.set(key, fn); }

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => redraws.forEach(fn => fn()), 150);
});

const tile = (label, value, foot = '', cls = '') =>
  `<div class="tile ${cls}"><span class="tile-label">${label}</span><strong class="tile-value">${value}</strong><span class="tile-foot">${foot}</span></div>`;

const head = (titulo, sub = '') =>
  `<header class="page-head"><h1>${titulo}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</header>`;

const tipRow = (cor, nome, valor) =>
  `<div class="tt-row"><span><i class="sw" style="--c:${cor}"></i>${nome}</span><b>${valor}</b></div>`;

function hbars(rows) {
  const max = Math.max(...rows.map(r => r.v), 1e-9);
  return `<ul class="hbars">${rows.map(r => `
    <li>
      <div class="hb-top"><span><i class="sw" style="--c:${r.cor}"></i>${esc(r.nome)}</span><span class="hb-val">${r.valor}</span></div>
      <div class="hb-track"><div class="hb-fill" style="width:${((r.v / max) * 100).toFixed(1)}%;--c:${r.cor}"></div></div>
    </li>`).join('')}</ul>`;
}

function statusMeta(razao) {
  if (razao <= 0.9) return { cls: 'good', icon: '✓', txt: 'Dentro da meta' };
  if (razao <= 1) return { cls: 'warning', icon: '!', txt: 'Perto do limite' };
  return { cls: 'critical', icon: '▲', txt: 'Acima da meta' };
}

/* ---------- Painel ---------- */

async function viewPainel(root) {
  const [disp, prev, h24, diario] = await Promise.all(['dispositivos', 'previsao', 'ultimas24h', 'diario'].map(Api.get));
  const s = Settings.get(), preco = precoKwh(s), cor = corDe(disp);
  const doMes = diario.filter(d => d.data.startsWith(prev.mes));
  const kwhMes = sum(doMes.map(d => d.total_kwh));
  const gastoPrev = prev.kwh_previsto * preco;
  const st = statusMeta(gastoPrev / s.meta);
  const escala = Math.max(s.meta, prev.kwh_max * preco) * 1.04;
  const ranking = disp
    .map(d => ({ ...d, kwh: sum(doMes.map(x => x.por_dispositivo[d.id] || 0)) }))
    .sort((a, b) => b.kwh - a.kwh);

  root.innerHTML = `
    ${head('Painel', new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
    <section class="tiles">
      ${tile('<span class="live-dot" aria-hidden="true"></span>Potência agora', '<span id="rt-total">—</span>', '<span id="rt-time">conectando…</span>', 'tile-live')}
      ${tile(`Consumo em ${mesNome(prev.mes)}`, `${nf(kwhMes, 1)} kWh`, `média de ${nf(kwhMes / Math.max(1, doMes.length - 1 + new Date().getHours() / 24), 1)} kWh por dia`)}
      ${tile('Gasto até agora', brl(kwhMes * preco), `tarifa de ${brl(preco)}/kWh`)}
      ${tile('Previsão da conta', brl(gastoPrev), `entre ${brl(prev.kwh_min * preco)} e ${brl(prev.kwh_max * preco)}`)}
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-head"><h2>Meta de gasto do mês</h2><a href="#configuracoes" class="link">Alterar meta</a></div>
        <p class="status ${st.cls}"><span class="status-icon" aria-hidden="true">${st.icon}</span>${st.txt}</p>
        <p class="lead">A previsão para ${mesNome(prev.mes)} é <b>${brl(gastoPrev)}</b>, ${gastoPrev <= s.meta ? 'abaixo' : 'acima'} da sua meta de <b>${brl(s.meta)}</b>.</p>
        <div class="meter" role="img" aria-label="Gasto atual ${brl(kwhMes * preco)}, previsão ${brl(gastoPrev)}, meta ${brl(s.meta)}">
          <div class="meter-prev" style="width:${(gastoPrev / escala * 100).toFixed(1)}%"></div>
          <div class="meter-now" style="width:${(kwhMes * preco / escala * 100).toFixed(1)}%"></div>
          <div class="meter-goal" style="left:${(s.meta / escala * 100).toFixed(1)}%"><span>meta</span></div>
        </div>
        <div class="legend">
          <span class="lg-item"><i class="sw" style="--c:var(--s1)"></i>Gasto até agora</span>
          <span class="lg-item"><i class="sw" style="--c:var(--s1-soft)"></i>Previsão até o fim do mês</span>
        </div>
      </article>
      <article class="card">
        <div class="card-head"><h2>Quem mais consome em ${mesNome(prev.mes)}</h2><a href="#equipamentos" class="link">Ver equipamentos</a></div>
        ${hbars(ranking.map(d => ({ nome: d.nome, cor: cor(d.id), v: d.kwh, valor: `${nf(d.kwh, 1)} kWh · ${pct(d.kwh / kwhMes, 0)}` })))}
      </article>
    </section>

    <article class="card">
      <div class="card-head"><h2>Potência nas últimas 24 horas</h2><span class="muted">média a cada 15 minutos</span></div>
      <div id="ch-24h"></div>
    </article>`;

  chart('24h', () => Charts.line($('#ch-24h'), {
    ariaLabel: 'Potência total da residência nas últimas 24 horas',
    labels: h24.map(p => hora(p.timestamp)),
    series: [{ name: 'Potência', color: 'var(--s1)', values: h24.map(p => p.potencia_w), area: true }],
    yFormat: v => `${nf(v)} W`,
    tip: i => `<div class="tt-title">${hora(h24[i].timestamp)}</div>${tipRow('var(--s1)', 'Potência', `${nf(h24[i].potencia_w)} W`)}`,
  }));

  startLive(rt => {
    $('#rt-total').textContent = `${nf(rt.potencia_total_w)} W`;
    $('#rt-time').textContent = `atualizado às ${new Date(rt.timestamp).toLocaleTimeString('pt-BR')}`;
  });
}

function startLive(onData) {
  const tick = async () => {
    try { onData(await Api.get('tempoReal')); } catch { /* mantém o último valor */ }
  };
  tick();
  timers.push(setInterval(tick, 3000));
}

/* ---------- Histórico mensal ---------- */

async function viewHistorico(root) {
  const mensal = (await Api.get('mensal')).filter(m => m.completo);
  const s = Settings.get(), preco = precoKwh(s);
  const kwh = m => m.kwh_sensores ?? fatKwh(m);
  let janela = 12;

  root.innerHTML = `
    ${head('Histórico mensal', 'Consumo de cada mês fechado. O mês atual aparece no Painel.')}
    <div class="filters">
      <div class="seg" role="group" aria-label="Período">
        <button type="button" data-n="12" aria-pressed="true">12 meses</button>
        <button type="button" data-n="24" aria-pressed="false">24 meses</button>
      </div>
    </div>
    <div id="hist-body"></div>`;

  function draw() {
    const lista = mensal.slice(-janela);
    const valores = lista.map(kwh);
    const iMax = valores.indexOf(Math.max(...valores));
    $('#hist-body').innerHTML = `
      <section class="tiles tiles-3">
        ${tile('Média mensal', `${nf(sum(valores) / valores.length)} kWh`, `≈ ${brl(sum(valores) / valores.length * preco)} por mês`)}
        ${tile('Mês de maior consumo', mesLongo(lista[iMax].mes), `${nf(valores[iMax])} kWh`)}
        ${tile(`Total em ${janela} meses`, `${nf(sum(valores))} kWh`, `≈ ${brl(sum(valores) * preco)} na tarifa atual`)}
      </section>
      <article class="card">
        <div class="card-head"><h2>Consumo por mês</h2><span class="muted">kWh</span></div>
        <div id="ch-hist"></div>
      </article>
      <article class="card">
        <div class="card-head"><h2>Tabela</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Fonte</th><th class="num">Consumo</th><th class="num">Custo estimado</th><th class="num">Fatura</th><th class="num">Diferença</th></tr></thead>
          <tbody>${lista.slice().reverse().map(m => {
            const f = fatKwh(m);
            const dif = m.kwh_sensores != null && f ? (m.kwh_sensores - f) / f : null;
            return `<tr>
              <td>${mesLongo(m.mes)}</td>
              <td>${m.com_sistema ? '<span class="tag tag-on">Sensores</span>' : '<span class="tag">Fatura</span>'}</td>
              <td class="num">${nf(kwh(m))} kWh</td>
              <td class="num">${brl(kwh(m) * preco)}</td>
              <td class="num">${f ? `${nf(f)} kWh` : '—'}</td>
              <td class="num">${dif == null ? '—' : (dif > 0 ? '+' : '') + pct(dif)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
        <p class="note">Antes da instalação do sistema, o consumo vem da fatura da concessionária. Depois, vem dos sensores CT; a coluna “Diferença” compara as duas medições.</p>
      </article>`;

    chart('hist', () => Charts.bar($('#ch-hist'), {
      ariaLabel: 'Consumo mensal em kWh',
      legend: [
        { name: 'Fatura da concessionária (antes do sistema)', color: 'var(--bar-muted)' },
        { name: 'Medido pelos sensores', color: 'var(--s1)' },
      ],
      labels: lista.map(m => mesCurto(m.mes)),
      series: [{ name: 'Consumo', values: valores, color: i => lista[i].com_sistema ? 'var(--s1)' : 'var(--bar-muted)' }],
      refLine: { value: s.meta / preco, label: `meta ≈ ${nf(s.meta / preco)} kWh` },
      yFormat: v => nf(v),
      tip: i => `<div class="tt-title">${mesLongo(lista[i].mes)}</div>
        ${tipRow(lista[i].com_sistema ? 'var(--s1)' : 'var(--bar-muted)', lista[i].com_sistema ? 'Sensores' : 'Fatura', `${nf(valores[i])} kWh`)}
        <div class="tt-row"><span>Custo estimado</span><b>${brl(valores[i] * preco)}</b></div>`,
    }));
  }

  root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    janela = +b.dataset.n;
    root.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    draw();
  }));
  draw();
}

/* ---------- Equipamentos ---------- */

async function viewEquipamentos(root) {
  const [disp, diario] = await Promise.all(['dispositivos', 'diario'].map(Api.get));
  const preco = precoKwh(), cor = corDe(disp);
  const mes = diario[diario.length - 1].data.slice(0, 7);
  const doMes = diario.filter(d => d.data.startsWith(mes));
  const total = sum(doMes.map(d => d.total_kwh));
  const ranking = disp
    .map(d => ({ ...d, kwh: sum(doMes.map(x => x.por_dispositivo[d.id] || 0)) }))
    .sort((a, b) => b.kwh - a.kwh);
  let sel = ranking[0].id;

  root.innerHTML = `
    ${head('Equipamentos', 'Cada sensor de corrente (CT) mede um circuito ou aparelho da casa.')}
    <section class="devices">${ranking.map(d => `
      <article class="card device" data-id="${d.id}">
        <div class="device-top">
          <span class="device-name"><i class="sw" style="--c:${cor(d.id)}"></i>${esc(d.nome)}</span>
          <span class="chip ${d.online ? 'on' : 'off'}">${d.canal} · ${d.online ? 'online' : 'offline'}</span>
        </div>
        <div class="device-power"><span class="pw">—</span><small>agora</small></div>
        <dl class="device-stats">
          <div><dt>Em ${mesNome(mes)}</dt><dd>${nf(d.kwh, 1)} kWh</dd></div>
          <div><dt>Custo</dt><dd>${brl(d.kwh * preco)}</dd></div>
          <div><dt>Participação</dt><dd>${pct(d.kwh / total, 0)}</dd></div>
        </dl>
      </article>`).join('')}
    </section>
    <article class="card">
      <div class="card-head">
        <h2>Consumo diário — últimos 30 dias</h2>
        <label class="select"><span class="sr-only">Equipamento</span>
          <select id="sel-disp">${ranking.map(d => `<option value="${d.id}">${esc(d.nome)}</option>`).join('')}</select>
        </label>
      </div>
      <div id="ch-disp"></div>
    </article>`;

  const ult30 = diario.slice(-31, -1); // dias completos
  function draw() {
    const d = disp.find(x => x.id === sel);
    const vals = ult30.map(x => x.por_dispositivo[sel] || 0);
    chart('disp', () => Charts.bar($('#ch-disp'), {
      ariaLabel: `Consumo diário de ${d.nome}`,
      labels: ult30.map(x => dataCurta(x.data)),
      series: [{ name: d.nome, color: cor(sel), values: vals }],
      yFormat: v => `${nf(v, v < 10 && v % 1 ? 1 : 0)}`,
      tip: i => `<div class="tt-title">${DIAS_SEMANA[new Date(ult30[i].data + 'T12:00').getDay()]}, ${dataCurta(ult30[i].data)}</div>
        ${tipRow(cor(sel), esc(d.nome), `${nf(vals[i], 2)} kWh`)}
        <div class="tt-row"><span>Custo</span><b>${brl(vals[i] * preco)}</b></div>`,
    }));
  }
  $('#sel-disp').addEventListener('change', e => { sel = e.target.value; draw(); });
  draw();

  startLive(rt => {
    for (const [id, w] of Object.entries(rt.por_dispositivo)) {
      const el = root.querySelector(`.device[data-id="${id}"] .pw`);
      if (el) el.textContent = w ? `${nf(w)} W` : 'desligado';
    }
  });
}

/* ---------- Previsão (machine learning) ---------- */

async function viewPrevisao(root) {
  const [prev, diario] = await Promise.all(['previsao', 'diario'].map(Api.get));
  const s = Settings.get(), preco = precoKwh(s);
  const n = prev.dias_no_mes;
  const real = Array(n + 1).fill(null), pv = Array(n + 1).fill(null), lo = Array(n + 1).fill(null), hi = Array(n + 1).fill(null);
  prev.real.forEach(p => { real[p.dia] = p.kwh_acumulado; });
  prev.previsto.forEach(p => { pv[p.dia] = p.kwh_acumulado; lo[p.dia] = p.min; hi[p.dia] = p.max; });

  // Padrão semanal dos últimos 28 dias completos
  const ult28 = diario.slice(-29, -1);
  const semana = [1, 2, 3, 4, 5, 6, 0].map(w => {
    const ds = ult28.filter(d => new Date(d.data + 'T12:00').getDay() === w);
    return { w, kwh: ds.length ? sum(ds.map(d => d.total_kwh)) / ds.length : 0 };
  });
  const media = sum(semana.map(x => x.kwh)) / 7;

  root.innerHTML = `
    ${head('Previsão de consumo', `Estimativa para ${mesLongo(prev.mes)}, atualizada a cada dia.`)}
    <section class="tiles">
      ${tile('Consumo previsto', `${nf(prev.kwh_previsto)} kWh`, `entre ${nf(prev.kwh_min)} e ${nf(prev.kwh_max)} kWh`)}
      ${tile('Conta prevista', brl(prev.kwh_previsto * preco), `meta: ${brl(s.meta)}`)}
      ${tile('Erro médio do modelo', prev.mae_kwh == null ? '—' : `${nf(prev.mae_kwh, 1)} kWh`, prev.mape == null ? 'sem meses suficientes para validar' : `MAE · ${pct(prev.mape)} do total do mês`)}
      ${tile('Dias restantes', nf(n - prev.real[prev.real.length - 1].dia), `de ${n} dias no mês`)}
    </section>

    <article class="card">
      <div class="card-head"><h2>Consumo acumulado no mês</h2><span class="muted">kWh</span></div>
      <div id="ch-prev"></div>
    </article>

    <section class="grid-2">
      <article class="card">
        <div class="card-head"><h2>Padrão por dia da semana</h2><span class="muted">média dos últimos 28 dias</span></div>
        <div id="ch-sem"></div>
      </article>
      <article class="card prose">
        <h2>Como a previsão é feita</h2>
        <p><b>Modelo atual:</b> ${esc(prev.modelo)}. Para cada dia que falta, o sistema usa o consumo médio daquele dia da semana nas últimas 4 semanas e soma ao que já foi medido.</p>
        <p><b>Faixa de incerteza:</b> a área sombreada cobre cerca de 80% dos resultados prováveis e se estreita conforme o mês avança.</p>
        <p><b>Validação:</b> o erro absoluto médio (MAE) é calculado prevendo os meses já fechados, a partir de cada dia, e comparando com o total realmente medido.</p>
        <p class="note">Este é o modelo de referência (baseline). Modelos mais sofisticados, como redes LSTM, serão comparados com ele pela mesma métrica.</p>
      </article>
    </section>`;

  chart('prev', () => Charts.line($('#ch-prev'), {
    ariaLabel: 'Consumo acumulado real e previsto no mês',
    legend: [
      { name: 'Medido', color: 'var(--s1)', kind: 'line' },
      { name: 'Previsão', color: 'var(--s2)', kind: 'dashed' },
      { name: 'Faixa provável (80%)', color: 'var(--s2)', kind: 'band' },
    ],
    labels: real.map((_, i) => (i ? String(i) : '')),
    series: [
      { name: 'Medido', color: 'var(--s1)', values: real },
      { name: 'Previsão', color: 'var(--s2)', values: pv, dashed: true },
    ],
    band: { lo, hi, color: 'var(--s2)' },
    refLine: { value: s.meta / preco, label: `meta ≈ ${nf(s.meta / preco)} kWh` },
    yFormat: v => nf(v),
    tip: i => `<div class="tt-title">${i ? `Dia ${i}` : 'Início do mês'}</div>
      ${real[i] != null ? tipRow('var(--s1)', 'Medido', `${nf(real[i], 1)} kWh`) : ''}
      ${pv[i] != null && real[i] == null ? tipRow('var(--s2)', 'Previsão', `${nf(pv[i], 1)} kWh`) : ''}
      ${pv[i] != null && real[i] == null ? `<div class="tt-row"><span>Faixa</span><b>${nf(lo[i])}–${nf(hi[i])} kWh</b></div>` : ''}`,
  }));

  chart('sem', () => Charts.bar($('#ch-sem'), {
    ariaLabel: 'Consumo médio por dia da semana',
    height: 220,
    labels: semana.map(x => DIAS_SEMANA[x.w]),
    series: [{ name: 'Média diária', color: 'var(--s1)', values: semana.map(x => x.kwh) }],
    yFormat: v => nf(v),
    tip: i => `<div class="tt-title">${DIAS_SEMANA[semana[i].w]}</div>
      ${tipRow('var(--s1)', 'Média', `${nf(semana[i].kwh, 1)} kWh`)}
      <div class="tt-row"><span>vs. média geral</span><b>${semana[i].kwh >= media ? '+' : ''}${pct(semana[i].kwh / media - 1, 0)}</b></div>`,
  }));
}

/* ---------- Antes x depois ---------- */

async function viewComparacao(root) {
  const mensal = await Api.get('mensal');
  const preco = precoKwh();
  const porMes = Object.fromEntries(mensal.map(m => [m.mes, m]));
  const anoAnterior = k => { const [y, m] = k.split('-'); return `${+y - 1}-${m}`; };
  const pos = mensal.filter(m => m.com_sistema && m.completo);
  const pre3 = mensal.filter(m => !m.com_sistema && m.completo).slice(-3);

  if (!pos.length) {
    root.innerHTML = `${head('Antes × depois')}<article class="card"><p>Ainda não há meses completos com o sistema instalado. A comparação aparece ao fim do primeiro mês.</p></article>`;
    return;
  }

  const rows = pos.map(m => ({ mes: m.mes, depois: m.kwh_sensores, antes: porMes[anoAnterior(m.mes)] && fatKwh(porMes[anoAnterior(m.mes)]) }));
  const comp = rows.filter(r => r.antes);
  const sA = sum(comp.map(r => r.antes)), sD = sum(comp.map(r => r.depois));
  const reducao = sA ? 1 - sD / sA : 0;
  const mediaPre = pre3.length ? sum(pre3.map(fatKwh)) / pre3.length : null;
  const mediaPos = sum(pos.map(m => m.kwh_sensores)) / pos.length;
  const anoRef = comp.length ? +comp[0].mes.slice(0, 4) - 1 : '';

  root.innerHTML = `
    ${head('Antes × depois', 'O acompanhamento do consumo ajudou a economizar?')}
    <section class="tiles">
      ${tile('Variação vs. ano anterior', `<span class="${reducao > 0 ? 'delta-good' : 'delta-bad'}">${reducao > 0 ? '▼' : '▲'} ${pct(Math.abs(reducao))}</span>`, `${comp.map(r => mesNome(r.mes)).join(' e ')}, comparado aos mesmos meses de ${anoRef}`)}
      ${tile('Energia economizada', `${nf(sA - sD)} kWh`, `no período com o sistema`)}
      ${tile('Economia estimada', brl((sA - sD) * preco), 'na tarifa atual')}
      ${tile('Média mensal', `${nf(mediaPos)} kWh`, mediaPre ? `antes: ${nf(mediaPre)} kWh (3 meses anteriores)` : '')}
    </section>

    <article class="card">
      <div class="card-head"><h2>Mesmo mês, antes e depois do sistema</h2><span class="muted">kWh</span></div>
      <div id="ch-comp"></div>
      <p class="note">Comparamos com o mesmo mês do ano anterior para reduzir o efeito do clima (uso de ar-condicionado e chuveiro muda ao longo do ano).</p>
    </article>

    <article class="card">
      <div class="card-head"><h2>Sensores × conta da concessionária</h2></div>
      <p class="lead">Digite o consumo (kWh) que aparece na sua conta de luz para conferir a precisão do protótipo.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th class="num">Sensores</th><th class="num">Conta de luz (kWh)</th><th class="num">Diferença</th></tr></thead>
        <tbody>${pos.slice().reverse().map(m => `
          <tr data-mes="${m.mes}">
            <td>${mesLongo(m.mes)}</td>
            <td class="num">${nf(m.kwh_sensores)} kWh</td>
            <td class="num"><input type="number" min="0" step="1" inputmode="numeric" aria-label="Consumo da conta em ${mesLongo(m.mes)}" value="${fatKwh(m) ?? ''}"></td>
            <td class="num dif"></td>
          </tr>`).join('')}</tbody>
      </table></div>
    </article>`;

  const atualizaDif = tr => {
    const m = porMes[tr.dataset.mes];
    const f = parseFloat(tr.querySelector('input').value);
    tr.querySelector('.dif').textContent = f > 0 ? `${m.kwh_sensores >= f ? '+' : ''}${pct((m.kwh_sensores - f) / f)}` : '—';
  };
  root.querySelectorAll('tr[data-mes]').forEach(tr => {
    atualizaDif(tr);
    tr.querySelector('input').addEventListener('input', e => {
      Faturas.set(tr.dataset.mes, e.target.value === '' ? null : parseFloat(e.target.value));
      atualizaDif(tr);
    });
  });

  chart('comp', () => Charts.bar($('#ch-comp'), {
    ariaLabel: 'Consumo antes e depois do sistema',
    legend: [
      { name: `Ano anterior (conta de luz)`, color: 'var(--s2)' },
      { name: 'Com o sistema (sensores)', color: 'var(--s1)' },
    ],
    labels: comp.map(r => MESES[r.mes.split('-')[1] - 1]),
    series: [
      { name: 'Ano anterior', color: 'var(--s2)', values: comp.map(r => r.antes) },
      { name: 'Com o sistema', color: 'var(--s1)', values: comp.map(r => r.depois) },
    ],
    yFormat: v => nf(v),
    tip: i => `<div class="tt-title">${MESES[comp[i].mes.split('-')[1] - 1]}</div>
      ${tipRow('var(--s2)', mesCurto(anoAnterior(comp[i].mes)), `${nf(comp[i].antes)} kWh`)}
      ${tipRow('var(--s1)', mesCurto(comp[i].mes), `${nf(comp[i].depois)} kWh`)}
      <div class="tt-row"><span>Variação</span><b>${pct(comp[i].depois / comp[i].antes - 1)}</b></div>`,
  }));
}

/* ---------- Configurações ---------- */

function viewConfiguracoes(root) {
  const s = Settings.get();
  root.innerHTML = `
    ${head('Configurações', 'Ficam salvas neste navegador.')}
    <form class="card form" id="form-cfg">
      <fieldset>
        <legend>Tarifa e meta</legend>
        <label>Tarifa de energia (R$/kWh, com impostos)
          <input name="tarifa" type="number" step="0.001" min="0" required value="${s.tarifa}">
          <small>Confira na sua conta de luz: valor total ÷ kWh consumidos.</small>
        </label>
        <label>Bandeira tarifária do mês
          <select name="bandeira">${Object.entries(BANDEIRAS).map(([k, b]) =>
            `<option value="${k}" ${k === s.bandeira ? 'selected' : ''}>${b.nome}${b.adicional ? ` (+${brl(b.adicional * 100)} a cada 100 kWh)` : ''}</option>`).join('')}
          </select>
        </label>
        <label>Meta de gasto mensal (R$)
          <input name="meta" type="number" step="1" min="1" required value="${s.meta}">
        </label>
      </fieldset>
      <fieldset>
        <legend>Conexão com o sistema</legend>
        <label>Endereço da API
          <input name="apiUrl" type="url" placeholder="https://seu-servidor.com" value="${esc(s.apiUrl)}">
          <small>Deixe em branco para usar o modo demonstração com dados simulados.</small>
        </label>
      </fieldset>
      <div class="form-actions">
        <button type="submit" class="btn primary">Salvar</button>
        <button type="button" class="btn" id="btn-reset">Restaurar padrões</button>
        <span id="cfg-status" role="status" class="muted"></span>
      </div>
    </form>`;

  const form = $('#form-cfg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(form);
    Settings.set({ tarifa: +d.get('tarifa'), bandeira: d.get('bandeira'), meta: +d.get('meta'), apiUrl: d.get('apiUrl').trim() });
    $('#cfg-status').textContent = 'Configurações salvas.';
    updateBanner();
  });
  $('#btn-reset').addEventListener('click', () => {
    Settings.set(Settings.PADRAO);
    Faturas.clear();
    viewConfiguracoes(root);
    $('#cfg-status').textContent = 'Padrões restaurados.';
    updateBanner();
  });
}

/* ---------- Sobre ---------- */

function viewSobre(root) {
  root.innerHTML = `
    ${head('Sobre o projeto', 'Sistema Inteligente de Monitoramento do Consumo Energético Residencial')}
    <article class="card prose">
      <p>Grande parte dos consumidores só descobre quanto gastou de energia quando a conta chega. Este sistema mede o consumo da casa continuamente, guarda o histórico e mostra, mês a mês, quanto cada equipamento consome e quanto a conta deve custar — para que dê tempo de agir antes do fechamento da fatura.</p>
    </article>

    <article class="card">
      <h2>Como funciona</h2>
      <ol class="flow">
        <li><b>Sensores CT + ESP32</b><span>Sensores de corrente não invasivos medem cada circuito; o ESP32 calcula corrente RMS e energia.</span></li>
        <li><b>Comunicação segura</b><span>As leituras são enviadas via HTTP/REST ou MQTT.</span></li>
        <li><b>Banco de dados</b><span>Armazena o histórico de leituras de forma consistente.</span></li>
        <li><b>Machine learning</b><span>Reconhece padrões de uso e prevê consumo e custo do mês.</span></li>
        <li><b>Este site</b><span>Mostra consumo, previsão, metas e o antes × depois.</span></li>
      </ol>
    </article>

    <section class="grid-2">
      <article class="card prose">
        <h2>Objetivos específicos</h2>
        <ol>
          <li>Desenvolver o módulo de hardware (ESP32 + sensores CT).</li>
          <li>Validar a comunicação segura entre o ESP32 e o banco de dados.</li>
          <li>Modelar e implementar o banco de dados de leituras.</li>
          <li>Implementar machine learning para padrões de consumo e previsão de custos.</li>
          <li>Desenvolver o site de visualização do consumo mensal.</li>
          <li>Comparar precisão e custo do protótipo com medidores comerciais.</li>
          <li>Validar o sistema comparando o consumo antes e depois do uso.</li>
        </ol>
      </article>
      <article class="card prose">
        <h2>Equipe</h2>
        <dl class="team">
          <div><dt>Alunas</dt><dd>Amanda Ferreira Dahm<br>Dara Yuna Borges Fujii</dd></div>
          <div><dt>Orientador</dt><dd>Prof. Anderson Jose Costa Sena</dd></div>
          <div><dt>Frentes</dt><dd>Hardware e sensoriamento (Engenharia de Computação)<br>Site, banco de dados e machine learning (Ciência da Computação)</dd></div>
          <div><dt>Instituição</dt><dd>IESB — Trabalho de Conclusão de Curso, 2026</dd></div>
        </dl>
      </article>
    </section>`;
}

/* ---------- roteador ---------- */

const ROTAS = {
  painel: viewPainel,
  historico: viewHistorico,
  equipamentos: viewEquipamentos,
  previsao: viewPrevisao,
  comparacao: viewComparacao,
  configuracoes: viewConfiguracoes,
  sobre: viewSobre,
};

function updateBanner() {
  $('#demo-banner').hidden = !Api.demo();
}

async function render() {
  const id = ROTAS[location.hash.slice(1)] ? location.hash.slice(1) : 'painel';
  timers.forEach(clearInterval);
  timers = [];
  redraws = new Map();
  document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${id}`));
  const main = $('#main');
  main.innerHTML = '<p class="loading">Carregando…</p>';
  try {
    await ROTAS[id](main);
  } catch (err) {
    main.innerHTML = `${head('Não foi possível carregar os dados')}
      <article class="card"><p>${esc(err.message)}</p>
      <p class="note">Verifique o endereço da API em <a href="#configuracoes">Configurações</a> ou deixe-o em branco para usar o modo demonstração.</p></article>`;
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
updateBanner();
render();
