/* Telas, roteamento por hash (#visao, #historico, ...) e atualização em tempo real. */

const NOME_SISTEMA = '[NOME DO SISTEMA]';

const $ = (s, r = document) => r.querySelector(s);
const sum = a => a.reduce((s, v) => s + v, 0);
const nf = (v, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v, d = 1) => `${nf(v * 100, d)}%`;
const sinal = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${pct(Math.abs(v), d)}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const partes = k => k.split('-').map(Number);
const mesAbrev = k => cap(MESES[partes(k)[1] - 1].slice(0, 3));                    // "Set"
const mesAno = k => `${mesAbrev(k)}/${String(partes(k)[0]).slice(2)}`;              // "Set/26"
const mesExtenso = k => `${MESES[partes(k)[1] - 1]}/${partes(k)[0]}`;               // "setembro/2026"
const diasNoMes = k => new Date(partes(k)[0], partes(k)[1], 0).getDate();
const ddmm = data => data.slice(8, 10) + '/' + data.slice(5, 7);
const dataBr = data => data.split('-').reverse().join('/');
const horaMin = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Barras dos circuitos: tons de verde do mais ao menos consumidor.
const RANK = ['var(--g-900)', 'var(--g-700)', 'var(--g-500)', 'var(--g-300)'];
const BANHO_MIN = 10; // duração média de um banho assumida na simulação de economia

const fatKwh = m => Faturas.get()[m.mes] ?? m.kwh_fatura;
const nomeDe = d => Nomes.get()[d.id] || d.nome;
const valorMes = m => (m.com_sistema ? m.kwh_sensores : fatKwh(m));

/* ---------- infraestrutura das telas ---------- */

let redraws = new Map();
let timers = [];

function chart(key, fn) { fn(); redraws.set(key, fn); }
function every(ms, fn) { fn(); timers.push(setInterval(fn, ms)); }

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => redraws.forEach(fn => fn()), 150);
});

const pageHead = (eyebrow, titulo, acoes = '') => `
  <header class="page-head">
    <div><p class="eyebrow" id="eyebrow">${eyebrow}</p><h1>${titulo}</h1></div>
    ${acoes ? `<div class="page-actions">${acoes}</div>` : ''}
  </header>`;

const tile = ({ label, value, unit = '', foot = '', cls = '', extra = '' }) => `
  <div class="tile ${cls}">
    <span class="tile-label">${label}</span>
    <strong class="tile-value">${value}${unit ? ` <small>${unit}</small>` : ''}</strong>
    ${extra}${foot ? `<span class="tile-foot">${foot}</span>` : ''}
  </div>`;

const mini = (label, value, cls = '') => `<div class="mini ${cls}"><span>${label}</span><b>${value}</b></div>`;

const legenda = itens => `<div class="legend">${itens
  .map(([kind, cor, nome]) => `<span class="lg-item"><i class="sw ${kind}" style="--c:${cor}"></i>${nome}</span>`)
  .join('')}</div>`;

const tipRow = (nome, valor, cor) =>
  `<div class="tt-row"><span>${cor ? `<i class="sw" style="--c:${cor}"></i>` : ''}${nome}</span><b>${valor}</b></div>`;

const nota = (extra = '') => Api.demo()
  ? `<p class="footnote">Valores ilustrativos para o protótipo${extra} — configure a API em <a href="#configuracoes">Configurações</a> para usar os dados reais do banco.</p>`
  : '';

function dialogo({ titulo, descricao = '', campos, enviar = 'Salvar', onSubmit }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.innerHTML = `
    <form class="form">
      <h2>${titulo}</h2>
      ${descricao ? `<p class="muted">${descricao}</p>` : ''}
      ${campos.map(c => `<label>${c.label}${c.options
        ? `<select name="${c.name}">${c.options.map(([v, t]) => `<option value="${esc(v)}" ${v === c.value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
        : `<input name="${c.name}" type="${c.type || 'text'}" ${c.step ? `step="${c.step}"` : ''} ${c.min != null ? `min="${c.min}"` : ''} ${c.required === false ? '' : 'required'} value="${esc(c.value ?? '')}" placeholder="${esc(c.placeholder || '')}">`}
      </label>`).join('')}
      <div class="form-actions">
        <button type="submit" class="btn dark">${enviar}</button>
        <button type="button" class="btn" data-cancel>Cancelar</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    onSubmit(Object.fromEntries(new FormData(e.target)));
    dlg.close();
  });
  dlg.showModal();
}

function lancarFatura(mensal) {
  const ops = mensal.filter(m => m.completo).slice(-12).reverse().map(m => [m.mes, cap(mesExtenso(m.mes))]);
  dialogo({
    titulo: 'Lançar consumo de uma fatura',
    descricao: 'Use o consumo em kWh impresso na conta de luz da concessionária.',
    campos: [
      { name: 'mes', label: 'Mês de referência', options: ops, value: ops[0][0] },
      { name: 'kwh', label: 'Consumo da fatura (kWh)', type: 'number', step: '1', min: 0 },
    ],
    onSubmit: d => {
      const f = Faturas.get();
      f[d.mes] = +d.kwh;
      Faturas.set(f);
      render();
    },
  });
}

function baixarCSV(nome, linhas) {
  const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function antesDepois(mensal) {
  const antes = mensal.filter(m => !m.com_sistema && m.completo).slice(-6);
  const depois = mensal.filter(m => m.com_sistema && m.completo);
  const mA = antes.length ? sum(antes.map(fatKwh)) / antes.length : null;
  const mD = depois.length ? sum(depois.map(m => m.kwh_sensores)) / depois.length : null;
  return { mA, mD, variacao: mA && mD ? mD / mA - 1 : null };
}

// Janela de 3 horas seguidas com maior consumo e o circuito que mais pesa nela.
function picoHorario(perfil) {
  const h = perfil.horas;
  let bi = 0, best = -1;
  for (let i = 0; i <= 21; i++) {
    const v = h[i].kwh + h[i + 1].kwh + h[i + 2].kwh;
    if (v > best) { best = v; bi = i; }
  }
  const ids = Object.keys(h[0].por_dispositivo);
  const dom = ids
    .map(id => [id, h[bi].por_dispositivo[id] + h[bi + 1].por_dispositivo[id] + h[bi + 2].por_dispositivo[id]])
    .sort((a, b) => b[1] - a[1])[0][0];
  return { inicio: bi, fim: bi + 2, janela: `${bi}h–${bi + 2}h`, dispositivo: dom };
}

const mediaDiaria = (diario, id, dias = 28) => {
  const ult = diario.slice(-dias - 1, -1);
  return ult.length ? sum(ult.map(d => d.por_dispositivo[id] || 0)) / ult.length : 0;
};

/* ---------- Visão mensal ---------- */

let mesSel = null;

async function viewVisao(root) {
  const [disp, mensal, prev, diario, perfil] = await Promise.all(['dispositivos', 'mensal', 'previsao', 'diario', 'perfilHorario'].map(Api.get));
  const s = Settings.get(), preco = precoKwh(s), ses = Sessao.get() || {};
  const mesesSis = mensal.filter(m => m.com_sistema).map(m => m.mes);
  const mes = mesesSis.includes(mesSel) ? mesSel : prev.mes;
  const atual = mes === prev.mes;
  const doMes = diario.filter(d => d.data.startsWith(mes));
  const kwh = sum(doMes.map(d => d.total_kwh));
  const nDias = diasNoMes(mes);
  const fechKwh = atual ? prev.kwh_previsto : kwh;
  const usado = (kwh * preco) / s.meta;
  const circ = disp.map(d => ({ ...d, kwh: sum(doMes.map(x => x.por_dispositivo[d.id] || 0)) }));
  const ordem = circ.slice().sort((a, b) => b.kwh - a.kwh).map(d => d.id);
  const iSel = mensal.findIndex(m => m.mes === mes);
  const ult6 = mensal.slice(Math.max(0, iSel - 5), iSel + 1);
  const temAntes = ult6.some(m => !m.com_sistema);
  const ad = antesDepois(mensal);
  const comparativo = mensal.filter(m => m.com_sistema && m.completo).slice(-3).reverse();
  const pico = picoHorario(perfil);
  const chuv = disp.find(d => d.id === 'chuveiro');
  const econ5 = chuv ? mediaDiaria(diario, 'chuveiro') * (5 / BANHO_MIN) * 30 * preco : 0;
  const domNome = nomeDe(disp.find(d => d.id === pico.dispositivo) || { id: pico.dispositivo, nome: pico.dispositivo });

  root.innerHTML = `
    ${pageHead(`Olá, ${esc(ses.nome || 'usuário')}`, `Consumo de ${mesExtenso(mes)}`, `
      <label class="inline-label">Mês
        <select id="sel-mes">${mesesSis.slice().reverse().map(k => `<option value="${k}" ${k === mes ? 'selected' : ''}>${cap(mesExtenso(k))}</option>`).join('')}</select>
      </label>
      <button type="button" class="btn dark" id="btn-export">Exportar relatório</button>`)}

    <div class="statusbar">
      <span><i class="dot-on"></i><b>ESP32 online</b> · última leitura <span id="rt-ago">agora</span> · ${disp.length} sensores CT ativos</span>
      <span class="mono">Potência agora: <b id="rt-kw">—</b></span>
    </div>

    <section class="tiles">
      ${tile({ label: atual ? 'Consumo no mês (até hoje)' : 'Consumo no mês', value: nf(kwh, 1), unit: 'kWh', foot: `<span class="green">${atual ? doMes.length : nDias} de ${nDias} dias medidos</span>` })}
      ${tile({ label: atual ? 'Gasto estimado até hoje' : 'Gasto estimado no mês', value: brl(kwh * preco), foot: 'consumo × tarifa cadastrada' })}
      ${tile({
        cls: 'dark',
        label: atual ? 'Previsão para o fechamento (ML)' : 'Fechamento do mês',
        value: brl(fechKwh * preco),
        foot: atual
          ? `≈ ${nf(fechKwh)} kWh${prev.mae_kwh != null ? ` · margem ± ${brl(prev.mae_kwh * preco)} (EAM)` : ''}`
          : `${nf(fechKwh)} kWh medidos pelo sistema`,
      })}
      ${tile({
        label: 'Meta mensal',
        value: brl(s.meta),
        extra: `<div class="progress ${usado > 1 ? 'over' : ''}"><div style="width:${Math.min(100, usado * 100).toFixed(1)}%"></div></div>`,
        foot: `${pct(usado, 0)} utilizado`,
      })}
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-head"><h2>Consumo mensal (kWh)</h2>
          ${legenda([...(temAntes ? [['', 'var(--bar-before)', 'Fatura']] : []), ['', 'var(--g-700)', 'Medido'], ...(atual ? [['ghost', 'var(--orange)', 'Previsto']] : [])])}
        </div>
        <div id="ch-mensal"></div>
      </article>
      <article class="card">
        <div class="card-head"><h2>Consumo por circuito (sensor CT)</h2></div>
        <ul class="circuits">${circ.map(d => `
          <li>
            <div class="c-top"><span>${d.canal} · ${esc(nomeDe(d))}${d.descricao ? ` (${esc(d.descricao)})` : ''}</span>
              <span class="mono">${nf(d.kwh, 1)} kWh · ${pct(kwh ? d.kwh / kwh : 0, 0)}</span></div>
            <div class="track"><div style="width:${kwh ? (d.kwh / kwh * 100).toFixed(1) : 0}%;background:${RANK[Math.min(3, ordem.indexOf(d.id))]}"></div></div>
          </li>`).join('')}
        </ul>
        <p class="callout">Padrão identificado: o circuito <b>${esc(domNome)}</b> concentra o pico entre ${pico.inicio}h e ${pico.fim}h.${chuv ? ` Reduzir 5 min por banho economiza cerca de ${brl(econ5)}/mês.` : ''}</p>
      </article>
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-head"><h2>Antes × depois do sistema</h2></div>
        <div class="minis">
          ${mini('Média antes (fatura)', ad.mA ? `${nf(ad.mA)} kWh` : '—')}
          ${mini('Média depois', ad.mD ? `${nf(ad.mD)} kWh` : '—')}
        </div>
        ${ad.variacao != null ? `<p class="delta-line"><span class="badge ${ad.variacao <= 0 ? 'good' : 'bad'}">${sinal(ad.variacao)}</span> ${ad.variacao <= 0 ? 'redução' : 'aumento'} média mensal desde a instalação</p>` : '<p class="muted">A comparação aparece ao fim do primeiro mês completo com o sistema.</p>'}
      </article>
      <article class="card">
        <div class="card-head"><h2>Medido × fatura da concessionária</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Sistema</th><th>Fatura</th><th>Diferença</th></tr></thead>
          <tbody>${comparativo.map(m => {
            const f = fatKwh(m);
            return `<tr><td class="mono">${mesAno(m.mes)}</td><td class="mono">${nf(m.kwh_sensores)} kWh</td>
              <td class="mono">${f ? `${nf(f)} kWh` : '—'}</td><td class="mono">${f ? pct(Math.abs(m.kwh_sensores - f) / f) : '—'}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Sem meses completos ainda.</td></tr>'}</tbody>
        </table></div>
        <button type="button" class="link-btn" id="btn-fatura">Lançar consumo de uma nova fatura</button>
      </article>
    </section>
    ${nota()}`;

  chart('mensal', () => Charts.bar($('#ch-mensal'), {
    ariaLabel: 'Consumo mensal em kWh',
    height: 230,
    axis: false,
    valueLabels: true,
    valueFormat: v => nf(v),
    labels: ult6.map(m => mesAbrev(m.mes)),
    values: ult6.map(valorMes),
    color: i => (ult6[i].com_sistema ? 'var(--g-700)' : 'var(--bar-before)'),
    ghost: ult6.map(m => (m.mes === prev.mes ? prev.kwh_previsto : null)),
    boldIndex: ult6.length - 1,
    tip: i => {
      const m = ult6[i];
      return `<div class="tt-title">${cap(mesExtenso(m.mes))}</div>
        ${tipRow(m.com_sistema ? (m.completo ? 'Medido' : 'Medido até hoje') : 'Fatura', `${nf(valorMes(m))} kWh`)}
        ${m.mes === prev.mes ? tipRow('Previsto', `${nf(prev.kwh_previsto)} kWh`) : ''}
        ${tipRow('Custo', brl((m.mes === prev.mes ? prev.kwh_previsto : valorMes(m)) * preco))}`;
    },
  }));

  $('#sel-mes').addEventListener('change', e => { mesSel = e.target.value; render(); });
  $('#btn-export').addEventListener('click', () => window.print());
  $('#btn-fatura').addEventListener('click', () => lancarFatura(mensal));

  let ultima = null;
  every(3000, async () => {
    try {
      const rt = await Api.get('tempoReal');
      ultima = new Date(rt.timestamp);
      const el = $('#rt-kw');
      if (el) el.textContent = `${nf(rt.potencia_total_w / 1000, 2)} kW`;
    } catch { /* mantém o último valor */ }
  });
  every(1000, () => {
    const el = $('#rt-ago');
    if (el && ultima) el.textContent = `há ${Math.max(0, Math.round((Date.now() - ultima) / 1000))} s`;
  });
}

/* ---------- Histórico ---------- */

let histModo = 'mensal';

async function viewHistorico(root) {
  const [mensal, prev, diario, h24, perfil] = await Promise.all(['mensal', 'previsao', 'diario', 'ultimas24h', 'perfilHorario'].map(Api.get));
  const preco = precoKwh();
  const EYEBROW = { mensal: 'Últimos 12 meses', diario: 'Últimos 30 dias', hora: 'Últimas 24 horas' };
  const pico = picoHorario(perfil);
  const maxPerfil = Math.max(...perfil.horas.map(h => h.kwh));
  const registros = mensal.filter(m => m.completo).slice(-12).reverse();

  root.innerHTML = `
    ${pageHead(EYEBROW[histModo], 'Histórico de consumo', `
      <div class="seg" role="group" aria-label="Período">
        ${[['mensal', 'Mensal'], ['diario', 'Diário'], ['hora', 'Por hora']].map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === histModo}">${t}</button>`).join('')}
      </div>`)}
    <article class="card" id="hist-main"></article>
    <article class="card">
      <div class="card-head"><h2>Perfil por hora do dia (média de ${MESES[partes(perfil.mes)[1] - 1]})</h2><span class="muted">Pico identificado: ${pico.janela}</span></div>
      <div id="ch-perfil"></div>
    </article>
    <article class="card">
      <div class="card-head"><h2>Registros mensais</h2><button type="button" class="btn" id="btn-csv">Baixar CSV</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th>Consumo</th><th>Custo estimado</th><th>Vs. mês anterior</th><th>Fonte</th></tr></thead>
        <tbody>${registros.map(m => {
          const i = mensal.indexOf(m);
          const ant = i > 0 ? valorMes(mensal[i - 1]) : null;
          const v = ant ? valorMes(m) / ant - 1 : null;
          return `<tr><td class="mono">${mesAno(m.mes)}</td><td class="mono">${nf(valorMes(m))} kWh</td><td class="mono">${brl(valorMes(m) * preco)}</td>
            <td class="mono ${v == null ? '' : v <= 0 ? 'green' : 'red'}">${v == null ? '—' : sinal(v)}</td><td>${m.com_sistema ? 'Sistema' : 'Fatura'}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </article>
    ${nota(` — tarifa de ${brl(preco)}/kWh`)}`;

  function drawMain() {
    $('#eyebrow').textContent = EYEBROW[histModo];
    const main = $('#hist-main');

    if (histModo === 'mensal') {
      const lista = mensal.slice(-12);
      const iInst = lista.findIndex(m => m.com_sistema);
      const ad = antesDepois(mensal);
      main.innerHTML = `
        <div class="card-head"><h2>Consumo mensal (kWh) — antes e depois da instalação</h2>
          ${legenda([['', 'var(--bar-before)', 'Fatura (antes)'], ['', 'var(--g-700)', 'Medido pelo sistema'], ['ghost', 'var(--orange)', 'Previsto']])}</div>
        <div id="ch-main"></div>
        <div class="minis minis-3">
          ${mini('Média antes', ad.mA ? `${nf(ad.mA)} kWh` : '—')}
          ${mini('Média depois', ad.mD ? `${nf(ad.mD)} kWh` : '—')}
          ${mini('Variação', ad.variacao != null ? sinal(ad.variacao) : '—', ad.variacao != null && ad.variacao <= 0 ? 'good' : '')}
        </div>`;
      chart('main', () => Charts.bar($('#ch-main'), {
        ariaLabel: 'Consumo mensal antes e depois da instalação',
        height: 250,
        axis: false,
        valueLabels: true,
        valueFormat: v => nf(v),
        labels: lista.map(m => mesAbrev(m.mes)),
        values: lista.map(valorMes),
        color: i => (lista[i].com_sistema ? 'var(--g-700)' : 'var(--bar-before)'),
        ghost: lista.map(m => (m.mes === prev.mes ? prev.kwh_previsto : null)),
        marker: iInst > 0 ? { index: iInst, label: 'Instalação' } : null,
        boldIndex: lista.length - 1,
        tip: i => `<div class="tt-title">${cap(mesExtenso(lista[i].mes))}</div>
          ${tipRow(lista[i].com_sistema ? 'Medido' : 'Fatura', `${nf(valorMes(lista[i]))} kWh`)}
          ${lista[i].mes === prev.mes ? tipRow('Previsto', `${nf(prev.kwh_previsto)} kWh`) : ''}`,
      }));
    } else if (histModo === 'diario') {
      const dias = diario.slice(-31, -1);
      const vals = dias.map(d => d.total_kwh);
      const iMax = vals.indexOf(Math.max(...vals));
      main.innerHTML = `
        <div class="card-head"><h2>Consumo diário (kWh)</h2>${legenda([['', 'var(--g-700)', 'Medido pelo sistema']])}</div>
        <div id="ch-main"></div>
        <div class="minis minis-3">
          ${mini('Média diária', `${nf(sum(vals) / vals.length, 1)} kWh`)}
          ${mini('Dia de maior consumo', `${ddmm(dias[iMax].data)} · ${nf(vals[iMax], 1)} kWh`)}
          ${mini('Gasto médio por dia', brl((sum(vals) / vals.length) * preco))}
        </div>`;
      chart('main', () => Charts.bar($('#ch-main'), {
        ariaLabel: 'Consumo diário nos últimos 30 dias',
        height: 250,
        yFormat: v => nf(v),
        labels: dias.map(d => ddmm(d.data)),
        values: vals,
        color: 'var(--g-700)',
        tip: i => `<div class="tt-title">${dataBr(dias[i].data)}</div>${tipRow('Consumo', `${nf(vals[i], 1)} kWh`)}${tipRow('Custo', brl(vals[i] * preco))}`,
      }));
    } else {
      const horas = [];
      for (let i = 0; i + 4 <= h24.length; i += 4) {
        const bloco = h24.slice(i, i + 4);
        horas.push({ t: bloco[0].timestamp, kwh: sum(bloco.map(p => p.potencia_w)) * 0.25 / 1000 });
      }
      const vals = horas.map(h => h.kwh);
      const iMax = vals.indexOf(Math.max(...vals));
      main.innerHTML = `
        <div class="card-head"><h2>Consumo por hora (kWh)</h2>${legenda([['', 'var(--g-700)', 'Medido pelo sistema']])}</div>
        <div id="ch-main"></div>
        <div class="minis minis-3">
          ${mini('Consumo nas últimas 24 h', `${nf(sum(vals), 1)} kWh`)}
          ${mini('Hora de maior consumo', `${horaMin(horas[iMax].t)} · ${nf(vals[iMax], 2)} kWh`)}
          ${mini('Potência média', `${nf((sum(vals) / vals.length) * 1000)} W`)}
        </div>`;
      chart('main', () => Charts.bar($('#ch-main'), {
        ariaLabel: 'Consumo por hora nas últimas 24 horas',
        height: 250,
        yFormat: v => nf(v, 1),
        labels: horas.map(h => horaMin(h.t)),
        values: vals,
        color: 'var(--g-700)',
        tip: i => `<div class="tt-title">${horaMin(horas[i].t)}</div>${tipRow('Consumo', `${nf(vals[i], 2)} kWh`)}`,
      }));
    }
  }

  chart('perfil', () => Charts.bar($('#ch-perfil'), {
    ariaLabel: 'Consumo médio por hora do dia',
    height: 150,
    axis: false,
    labels: perfil.horas.map(h => `${h.hora}h`),
    values: perfil.horas.map(h => h.kwh),
    xTicks: [0, 6, 12, 18, 23],
    color: i => {
      if (i >= pico.inicio && i <= pico.fim) return 'var(--g-900)';
      const r = perfil.horas[i].kwh / maxPerfil;
      return r > 0.55 ? 'var(--g-700)' : r > 0.3 ? 'var(--g-500)' : 'var(--g-300)';
    },
    tip: i => `<div class="tt-title">${i}h – ${i + 1}h</div>${tipRow('Média', `${nf(perfil.horas[i].kwh, 2)} kWh`)}`,
  }));

  root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    histModo = b.dataset.k;
    root.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawMain();
  }));
  $('#btn-csv').addEventListener('click', () => baixarCSV('registros-mensais.csv', [
    ['Mês', 'Consumo (kWh)', 'Custo estimado (R$)', 'Fonte'],
    ...registros.map(m => [m.mes, nf(valorMes(m)), nf(valorMes(m) * preco, 2), m.com_sistema ? 'Sistema' : 'Fatura']),
  ]));
  drawMain();
}

/* ---------- Equipamentos ---------- */

async function viewEquipamentos(root) {
  const [disp, diario, picos, calib] = await Promise.all(['dispositivos', 'diario', 'picos', 'calibracao'].map(Api.get));
  const preco = precoKwh();
  const mes = diario[diario.length - 1].data.slice(0, 7);
  const doMes = diario.filter(d => d.data.startsWith(mes));
  const total = sum(doMes.map(d => d.total_kwh));
  const circ = disp.map(d => ({ ...d, kwh: sum(doMes.map(x => x.por_dispositivo[d.id] || 0)) }));
  const ordem = circ.slice().sort((a, b) => b.kwh - a.kwh).map(d => d.id);
  const novos = SensoresNovos.get();
  const calLocal = Calibracoes.get();
  const sensoresCal = calib.sensores.map(c => ({ ...c, ...(calLocal[c.canal] || {}) }));
  const ultimaCal = Object.values(calLocal).map(c => c.data).concat(calib.ultima).sort().pop();
  const fmtDur = m => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const nomeId = id => nomeDe(disp.find(d => d.id === id) || { id, nome: id });
  const ddhh = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${horaMin(iso)}`; };

  root.innerHTML = `
    ${pageHead(`${disp.length} circuitos monitorados · ${mesExtenso(mes)}`, 'Equipamentos e sensores',
      '<button type="button" class="btn dark" id="btn-add">+ Adicionar sensor</button>')}
    <section class="devices">
      ${circ.map(d => `
        <article class="card device" data-id="${d.id}">
          <div class="dev-top">
            <div><span class="dev-ch mono">${d.canal} · GPIO ${d.gpio}</span><h3 class="dev-name">${esc(nomeDe(d))}</h3></div>
            <span class="chip ${d.online ? 'on' : 'off'}">${d.online ? 'Ativo' : 'Offline'}</span>
          </div>
          <div class="dev-stats">
            <div><span>Potência agora</span><b class="mono pw">—</b></div>
            <div><span>No mês</span><b class="mono">${nf(d.kwh, 1)} kWh</b></div>
          </div>
          <div class="track"><div style="width:${total ? (d.kwh / total * 100).toFixed(1) : 0}%;background:${RANK[Math.min(3, ordem.indexOf(d.id))]}"></div></div>
          <div class="dev-foot"><span>${pct(total ? d.kwh / total : 0, 0)} do total · ${brl(d.kwh * preco)}</span><button type="button" class="link-btn" data-rename="${d.id}">Renomear</button></div>
        </article>`).join('')}
      ${novos.map(n => `
        <article class="card device pending">
          <div class="dev-top">
            <div><span class="dev-ch mono">${esc(n.canal)} · GPIO ${esc(n.gpio)}</span><h3 class="dev-name">${esc(n.nome)}</h3></div>
            <span class="chip off">Aguardando</span>
          </div>
          <p class="muted">O sensor passa a mostrar leituras assim que o ESP32 começar a enviá-las.</p>
        </article>`).join('')}
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-head"><h2>Maiores picos do mês</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Quando</th><th>Circuito</th><th>Pico</th><th>Duração</th></tr></thead>
          <tbody>${picos.map(p => `<tr><td class="mono">${ddhh(p.inicio)}</td><td>${esc(nomeId(p.dispositivo_id))}</td>
            <td class="mono">${nf(p.pico_w)} W</td><td class="mono">${fmtDur(p.duracao_min)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem picos registrados neste mês.</td></tr>'}</tbody>
        </table></div>
      </article>
      <article class="card">
        <div class="card-head"><h2>Calibração dos sensores</h2><span class="muted">Última: ${dataBr(ultimaCal)}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Sensor</th><th>Fator</th><th>Referência</th><th>Erro</th></tr></thead>
          <tbody>${sensoresCal.map(c => `<tr><td class="mono">${c.canal}</td><td class="mono">${c.fator != null && c.fator !== '' ? esc(c.fator) : '<span class="muted">a definir</span>'}</td>
            <td class="mono">${esc(c.referencia)}</td><td class="mono">${nf(+c.erro_pct, 1)}%</td></tr>`).join('')}</tbody>
        </table></div>
        <button type="button" class="btn" id="btn-cal">Registrar nova calibração</button>
      </article>
    </section>
    ${nota(' — os pinos GPIO e fatores de calibração dependem do módulo de hardware')}`;

  root.querySelectorAll('[data-rename]').forEach(b => b.addEventListener('click', () => {
    const d = disp.find(x => x.id === b.dataset.rename);
    dialogo({
      titulo: `Renomear ${d.canal}`,
      campos: [{ name: 'nome', label: 'Nome do circuito', value: nomeDe(d) }],
      onSubmit: v => { const n = Nomes.get(); n[d.id] = v.nome.trim() || d.nome; Nomes.set(n); render(); },
    });
  }));
  $('#btn-add').addEventListener('click', () => {
    const prox = disp.length + novos.length + 1;
    dialogo({
      titulo: 'Adicionar sensor',
      descricao: 'Cadastre o sensor CT ligado ao ESP32.',
      campos: [
        { name: 'canal', label: 'Canal', value: `CT${prox}` },
        { name: 'gpio', label: 'Pino GPIO do ESP32', type: 'number', min: 0, step: '1' },
        { name: 'nome', label: 'Nome do circuito', placeholder: 'Ex.: Máquina de lavar' },
      ],
      enviar: 'Adicionar',
      onSubmit: v => { SensoresNovos.set([...novos, v]); render(); },
    });
  });
  $('#btn-cal').addEventListener('click', () => dialogo({
    titulo: 'Registrar nova calibração',
    descricao: 'Compare a leitura do sensor com um instrumento de referência ligado à mesma carga.',
    campos: [
      { name: 'canal', label: 'Sensor', options: sensoresCal.map(c => [c.canal, c.canal]), value: sensoresCal[0].canal },
      { name: 'fator', label: 'Fator de calibração', type: 'number', step: 'any' },
      { name: 'referencia', label: 'Instrumento de referência', value: 'Multímetro' },
      { name: 'erro_pct', label: 'Erro medido (%)', type: 'number', step: '0.1', min: 0 },
    ],
    onSubmit: v => {
      const c = Calibracoes.get();
      c[v.canal] = { fator: v.fator, referencia: v.referencia, erro_pct: +v.erro_pct, data: new Date().toISOString().slice(0, 10) };
      Calibracoes.set(c);
      render();
    },
  }));

  every(3000, async () => {
    try {
      const rt = await Api.get('tempoReal');
      for (const [id, w] of Object.entries(rt.por_dispositivo)) {
        const el = root.querySelector(`.device[data-id="${id}"] .pw`);
        if (el) el.textContent = `${nf(w)} W`;
      }
    } catch { /* mantém o último valor */ }
  });
}

/* ---------- Previsão de custo ---------- */

let banhoMin = 2;

async function viewPrevisao(root) {
  const [prev, diario, disp] = await Promise.all(['previsao', 'diario', 'dispositivos'].map(Api.get));
  const s = Settings.get(), preco = precoKwh(s);
  const n = prev.dias_no_mes;
  const real = Array(n + 1).fill(null), pv = Array(n + 1).fill(null), lo = Array(n + 1).fill(null), hi = Array(n + 1).fill(null);
  prev.real.forEach(p => { real[p.dia] = p.kwh_acumulado; });
  prev.previsto.forEach(p => { pv[p.dia] = p.kwh_acumulado; lo[p.dia] = p.min; hi[p.dia] = p.max; });
  const hoje = prev.real[prev.real.length - 1];
  const medidoAgora = sum(diario.filter(d => d.data.startsWith(prev.mes)).map(d => d.total_kwh));
  const conta = prev.kwh_previsto * preco;
  const folga = s.meta - conta;
  const metaKwh = s.meta / preco;
  const restantes = n - hoje.dia;
  const temChuveiro = disp.some(d => d.id === 'chuveiro');
  const chuvDia = mediaDiaria(diario, 'chuveiro');
  const [y, m] = partes(prev.mes);

  root.innerHTML = `
    ${pageHead(`Fechamento previsto para ${dataBr(`${y}-${String(m).padStart(2, '0')}-${n}`)}`, 'Previsão de custo')}
    <section class="tiles tiles-3">
      ${tile({ cls: 'dark', label: 'Conta prevista', value: brl(conta), foot: `faixa provável ${brl(prev.kwh_min * preco)} – ${brl(prev.kwh_max * preco)}` })}
      ${tile({ label: 'Consumo previsto', value: nf(prev.kwh_previsto), unit: 'kWh', foot: `${nf(medidoAgora, 1)} kWh medidos até agora` })}
      ${tile({ label: `Situação da meta (${brl(s.meta)})`, value: `<span class="${folga >= 0 ? 'green' : 'red'}">${folga >= 0 ? 'Dentro' : 'Acima'}</span>`,
        foot: folga >= 0 ? `folga prevista de ${brl(folga)}` : `excesso previsto de ${brl(-folga)}` })}
    </section>

    <article class="card">
      <div class="card-head"><h2>Consumo acumulado no mês (kWh)</h2>
        ${legenda([['line', 'var(--g-700)', 'Medido'], ['dashed', 'var(--orange)', 'Previsto'], ['band', 'var(--band)', 'Margem de erro'], ['line', 'var(--meta)', 'Meta']])}</div>
      <div id="ch-prev"></div>
    </article>

    <section class="grid-2">
      <article class="card">
        <div class="card-head"><h2>Simular economia</h2></div>
        ${temChuveiro ? `
          <p class="muted">Reduzir o tempo de cada banho em:</p>
          <div class="choice" role="group" aria-label="Redução por banho">
            ${[[0, 'Nada'], [2, '2 min'], [5, '5 min'], [8, '8 min']].map(([v, t]) => `<button type="button" data-min="${v}" aria-pressed="${v === banhoMin}">${t}</button>`).join('')}
          </div>
          <div class="minis" id="sim-out"></div>
          <p class="footnote">Base: consumo médio do CT1 nas últimas 4 semanas e banho de ${BANHO_MIN} min em média.</p>`
        : '<p class="muted">A simulação usa o sensor do chuveiro, que não está cadastrado.</p>'}
      </article>
      <article class="card">
        <div class="card-head"><h2>Sobre o modelo</h2></div>
        <dl class="kv">
          <div><dt>Algoritmo</dt><dd>${esc(prev.modelo)}</dd></div>
          <div><dt>Dados de treino</dt><dd>Leituras do banco desde ${mesExtenso(prev.treino_desde.slice(0, 7)).replace(/^(\w{3})\w*/, '$1')}</dd></div>
          <div><dt>Erro absoluto médio</dt><dd class="mono">${prev.mae_kwh != null ? `${nf(prev.mae_kwh, 1)} kWh` : '—'}</dd></div>
          <div><dt>Último treino</dt><dd>${dataBr(prev.ultimo_treino)}</dd></div>
          <div><dt>Variáveis</dt><dd>${esc(prev.variaveis)}</dd></div>
        </dl>
        <p class="infobox">A previsão é recalculada a cada novo lote de leituras enviado pelo ESP32.</p>
      </article>
    </section>
    ${nota(` — tarifa de ${brl(preco)}/kWh`)}`;

  const ticks = [];
  for (let d = 1; d <= n; d += 5) ticks.push(d);
  if (ticks[ticks.length - 1] !== n) ticks.push(n);

  chart('prev', () => Charts.line($('#ch-prev'), {
    ariaLabel: 'Consumo acumulado medido e previsto no mês',
    height: 320,
    labels: real.map((_, i) => String(i)),
    xTicks: ticks,
    xTitle: 'Dia do mês',
    series: [
      { color: 'var(--g-700)', values: real },
      { color: 'var(--orange)', values: pv, dashed: true },
    ],
    band: { lo, hi, color: 'var(--band)' },
    refLine: { value: metaKwh, label: `Meta: ${nf(metaKwh)} kWh (${brl(s.meta)})`, color: 'var(--meta)' },
    points: [
      { i: hoje.dia, v: hoje.kwh_acumulado, color: 'var(--g-700)', label: `Até ontem · ${nf(hoje.kwh_acumulado, 1)}`, dx: 10, dy: 22 },
      { i: n, v: prev.kwh_previsto, color: 'var(--orange)', label: `${nf(prev.kwh_previsto)} kWh`, dx: -10, dy: 26, anchor: 'end', labelColor: 'var(--orange)' },
    ],
    yFormat: v => nf(v),
    tip: i => `<div class="tt-title">Dia ${i}</div>
      ${real[i] != null ? tipRow('Medido', `${nf(real[i], 1)} kWh`, 'var(--g-700)') : ''}
      ${pv[i] != null && i > hoje.dia ? tipRow('Previsto', `${nf(pv[i], 1)} kWh`, 'var(--orange)') : ''}
      ${pv[i] != null && i > hoje.dia ? tipRow('Margem', `${nf(lo[i])}–${nf(hi[i])} kWh`) : ''}`,
  }));

  function simular() {
    const out = $('#sim-out');
    if (!out) return;
    const econ = chuvDia * (banhoMin / BANHO_MIN) * restantes * preco;
    out.innerHTML = mini('Economia no mês', brl(econ), 'good') + mini('Nova previsão', brl(conta - econ));
  }
  root.querySelectorAll('[data-min]').forEach(b => b.addEventListener('click', () => {
    banhoMin = +b.dataset.min;
    root.querySelectorAll('[data-min]').forEach(x => x.setAttribute('aria-pressed', x === b));
    simular();
  }));
  simular();
}

/* ---------- Dispositivo ESP32 ---------- */

async function viewEsp32(root) {
  const [esp, disp, h24] = await Promise.all(['esp32', 'dispositivos', 'ultimas24h'].map(Api.get));
  const entrega = esp.pacotes_recebidos_24h / esp.pacotes_esperados_24h;
  const seg = (Date.now() - new Date(esp.ligado_desde)) / 1000;
  const ligado = `${Math.floor(seg / 86400)} d ${Math.floor((seg % 86400) / 3600)} h`;
  const qualidade = esp.rssi_dbm >= -60 ? 'excelente' : esp.rssi_dbm >= -70 ? 'bom' : 'fraco';

  root.innerHTML = `
    ${pageHead(`${esc(esp.id)} · firmware ${esc(esp.firmware)}`, 'Dispositivo ESP32')}
    <section class="tiles">
      ${tile({ label: 'Status', value: `<span class="${esp.online ? 'green' : 'red'}">${esp.online ? 'Online' : 'Offline'}</span>`, foot: `última leitura às ${new Date(esp.ultima_leitura).toLocaleTimeString('pt-BR')}` })}
      ${tile({ label: 'Sinal Wi-Fi', value: esp.rssi_dbm, unit: 'dBm', foot: `sinal ${qualidade}` })}
      ${tile({ label: 'Ligado há', value: ligado, foot: 'desde a última reinicialização' })}
      ${tile({ label: 'Entrega de pacotes (24 h)', value: pct(entrega), foot: `${nf(esp.pacotes_recebidos_24h)} de ${nf(esp.pacotes_esperados_24h)} recebidos` })}
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-head"><h2>Últimas leituras recebidas</h2><span class="muted">a cada ${esp.intervalo_envio_s} s</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Horário</th>${disp.map(d => `<th>${d.canal}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody id="leituras"></tbody>
        </table></div>
      </article>
      <article class="card">
        <div class="card-head"><h2>Configuração</h2></div>
        <dl class="kv">
          <div><dt>Endereço IP</dt><dd class="mono">${esc(esp.ip)}</dd></div>
          <div><dt>Protocolo</dt><dd>${esc(esp.protocolo)}</dd></div>
          <div><dt>Endpoint</dt><dd class="mono">${esc(esp.endpoint)}</dd></div>
          <div><dt>Intervalo de envio</dt><dd>${esp.intervalo_envio_s} s</dd></div>
          <div><dt>Sensores conectados</dt><dd>${disp.map(d => `${d.canal} (GPIO ${d.gpio})`).join(', ')}</dd></div>
        </dl>
      </article>
    </section>

    <article class="card">
      <div class="card-head"><h2>Potência total nas últimas 24 horas (W)</h2>${legenda([['line', 'var(--g-700)', 'Média a cada 15 min']])}</div>
      <div id="ch-24h"></div>
    </article>
    ${nota()}`;

  chart('24h', () => Charts.line($('#ch-24h'), {
    ariaLabel: 'Potência total nas últimas 24 horas',
    height: 240,
    labels: h24.map(p => horaMin(p.timestamp)),
    series: [{ color: 'var(--g-700)', values: h24.map(p => p.potencia_w) }],
    yFormat: v => nf(v),
    tip: i => `<div class="tt-title">${horaMin(h24[i].timestamp)}</div>${tipRow('Potência', `${nf(h24[i].potencia_w)} W`)}`,
  }));

  const linhas = [];
  every(3000, async () => {
    try {
      const rt = await Api.get('tempoReal');
      linhas.unshift(rt);
      linhas.length = Math.min(linhas.length, 8);
      const tb = $('#leituras');
      if (tb) tb.innerHTML = linhas.map(l => `<tr><td class="mono">${new Date(l.timestamp).toLocaleTimeString('pt-BR')}</td>
        ${disp.map(d => `<td class="mono">${nf(l.por_dispositivo[d.id] || 0)}</td>`).join('')}<td class="mono"><b>${nf(l.potencia_total_w)} W</b></td></tr>`).join('');
    } catch { /* mantém as linhas */ }
  });
}

/* ---------- Configurações ---------- */

function viewConfiguracoes(root) {
  const s = Settings.get(), ses = Sessao.get() || {};
  root.innerHTML = `
    ${pageHead('Preferências da residência', 'Configurações')}
    <form class="card form" id="form-cfg">
      <fieldset>
        <legend>Conta</legend>
        <label>Seu nome<input name="nome" required value="${esc(ses.nome || '')}"></label>
      </fieldset>
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
        <legend>Conexão com o banco de dados</legend>
        <label>Endereço da API
          <input name="apiUrl" type="url" placeholder="https://seu-servidor.com" value="${esc(s.apiUrl)}">
          <small>Deixe em branco para usar o modo demonstração com dados simulados.</small>
        </label>
      </fieldset>
      <div class="form-actions">
        <button type="submit" class="btn dark">Salvar</button>
        <button type="button" class="btn" id="btn-reset">Restaurar padrões</button>
        <button type="button" class="btn" id="btn-sair">Sair</button>
        <span id="cfg-status" role="status" class="muted"></span>
      </div>
    </form>`;

  const form = $('#form-cfg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(form);
    Settings.set({ tarifa: +d.get('tarifa'), bandeira: d.get('bandeira'), meta: +d.get('meta'), apiUrl: d.get('apiUrl').trim() });
    Sessao.set({ ...ses, nome: d.get('nome').trim() });
    $('#cfg-status').textContent = 'Configurações salvas.';
    updateSidebar();
  });
  $('#btn-reset').addEventListener('click', () => {
    Settings.set(Settings.PADRAO);
    [Faturas, Nomes, SensoresNovos, Calibracoes].forEach(x => x.clear());
    viewConfiguracoes(root);
    $('#cfg-status').textContent = 'Padrões restaurados.';
    updateSidebar();
  });
  $('#btn-sair').addEventListener('click', () => { Sessao.clear(); location.hash = '#entrar'; });
}

/* ---------- Entrar / cadastro ---------- */

let authModo = 'entrar';

function viewEntrar(root) {
  const cad = authModo === 'cadastro';
  root.innerHTML = `
    <section class="auth-hero">
      <div class="brand"><span class="logo">${LOGO}</span><b>${NOME_SISTEMA}</b></div>
      <div>
        <h1>Saiba quanto sua casa consome antes da fatura chegar.</h1>
        <p>Medição contínua por sensores no quadro elétrico, histórico mensal e previsão do valor da conta.</p>
      </div>
      <ul class="bullets"><li>Consumo por circuito</li><li>Previsão de custo</li><li>Metas mensais</li></ul>
    </section>
    <section class="auth-form">
      <form id="form-auth" class="form">
        <h2>${cad ? 'Cadastrar residência' : 'Entrar'}</h2>
        <p class="muted">${cad ? 'Crie seu acesso e vincule o ESP32 instalado no quadro.' : 'Acesse o painel da sua residência.'}</p>
        ${cad ? '<label>Nome<input name="nome" required autocomplete="name"></label>' : ''}
        <label>E-mail<input name="email" type="email" required placeholder="nome@exemplo.com" autocomplete="email"></label>
        <label><span class="label-row">Senha${cad ? '' : '<button type="button" class="link-btn" id="btn-esqueci">Esqueci a senha</button>'}</span>
          <input name="senha" type="password" required autocomplete="${cad ? 'new-password' : 'current-password'}"></label>
        ${cad ? '<label>Código do ESP32<input name="codigo" required placeholder="ESP32-01"></label>' : ''}
        <p id="auth-msg" class="muted" role="status"></p>
        <button type="submit" class="btn dark block">${cad ? 'Cadastrar' : 'Entrar'}</button>
        <p class="auth-switch">${cad
          ? 'Já tem acesso? <button type="button" class="link-btn" id="btn-modo">Entrar</button>'
          : 'Primeiro acesso? <button type="button" class="link-btn" id="btn-modo">Cadastre sua residência e o código do ESP32</button>'}</p>
        ${Api.demo() ? '<p class="footnote">Modo demonstração: qualquer e-mail e senha entram.</p>' : ''}
      </form>
    </section>`;

  $('#btn-modo').addEventListener('click', () => { authModo = cad ? 'entrar' : 'cadastro'; viewEntrar(root); });
  $('#btn-esqueci')?.addEventListener('click', () => {
    $('#auth-msg').textContent = 'A recuperação de senha ainda não está disponível no protótipo.';
  });
  $('#form-auth').addEventListener('submit', async e => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(e.target));
    try {
      Sessao.set(await Api.post(cad ? 'cadastro' : 'login', dados));
      location.hash = '#visao';
    } catch (err) {
      $('#auth-msg').textContent = err.message;
    }
  });
}

/* ---------- roteador ---------- */

const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 6 13.5h5.5L10.5 21 18 10h-5.5z"/></svg>';

const ROTAS = {
  visao: viewVisao,
  historico: viewHistorico,
  equipamentos: viewEquipamentos,
  previsao: viewPrevisao,
  esp32: viewEsp32,
  configuracoes: viewConfiguracoes,
};

function updateSidebar() {
  $('#side-tarifa').textContent = `R$ ${nf(precoKwh(), 2)}/kWh`;
}

async function render() {
  let id = location.hash.slice(1);
  timers.forEach(clearInterval);
  timers = [];
  redraws = new Map();

  if (id === 'entrar' || !Sessao.get()) {
    if (id !== 'entrar') { location.replace('#entrar'); return; }
    document.body.classList.add('auth');
    viewEntrar($('#auth'));
    return;
  }
  document.body.classList.remove('auth');
  if (!ROTAS[id]) id = 'visao';
  document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${id}`));
  updateSidebar();
  const main = $('#main');
  main.innerHTML = '<p class="loading">Carregando…</p>';
  try {
    await ROTAS[id](main);
  } catch (err) {
    main.innerHTML = `${pageHead('Erro', 'Não foi possível carregar os dados')}
      <article class="card"><p>${esc(err.message)}</p>
      <p class="muted">Verifique o endereço da API em <a href="#configuracoes">Configurações</a> ou deixe-o em branco para usar o modo demonstração.</p></article>`;
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

document.querySelectorAll('.brand-name').forEach(el => { el.textContent = NOME_SISTEMA; });
window.addEventListener('hashchange', render);
render();
