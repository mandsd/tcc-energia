/* Telas, roteamento por hash (#visao, #historico, ...) e atualização em tempo real. */

const NOME_SISTEMA = 'Consumo Energético Residencial';

const $ = (s, r = document) => r.querySelector(s);
const sum = a => a.reduce((s, v) => s + v, 0);
const nf = (v, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v, d = 1) => `${nf(v * 100, d)}%`;
const sinal = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${pct(Math.abs(v), d)}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const partes = k => k.split('-').map(Number);
const mesNome = k => MESES[partes(k)[1] - 1];                                       // "setembro"
const mesAbrev = k => cap(mesNome(k).slice(0, 3));                                  // "Set"
const mesAno = k => `${mesAbrev(k)}/${String(partes(k)[0]).slice(2)}`;              // "Set/26"
const mesLongo = k => `${mesNome(k)} de ${partes(k)[0]}`;                           // "setembro de 2026"
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

const pageHead = ({ eyebrow = '', titulo, lede = '', acoes = '' }) => `
  <header class="page-head">
    <div>
      ${eyebrow ? `<p class="eyebrow" id="eyebrow">${eyebrow}</p>` : ''}
      <h1>${titulo}</h1>
      ${lede ? `<p class="lede">${lede}</p>` : ''}
    </div>
    ${acoes ? `<div class="page-actions">${acoes}</div>` : ''}
  </header>`;

const tile = ({ label, value, unit = '', foot = '', cls = '', extra = '' }) => `
  <div class="tile ${cls}">
    <span class="tile-label">${label}</span>
    <strong class="tile-value">${value}${unit ? ` <small>${unit}</small>` : ''}</strong>
    ${extra}${foot ? `<span class="tile-foot">${foot}</span>` : ''}
  </div>`;

const mini = (label, value, cls = '') => `<div class="mini ${cls}"><span>${label}</span><b>${value}</b></div>`;

const cardHead = (titulo, sub = '', direita = '') => `
  <div class="card-head">
    <div><h2>${titulo}</h2>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>
    ${direita}
  </div>`;

const legenda = itens => `<div class="legend">${itens
  .map(([kind, cor, nome]) => `<span class="lg-item"><i class="sw ${kind}" style="--c:${cor}"></i>${nome}</span>`)
  .join('')}</div>`;

const tipRow = (nome, valor, cor) =>
  `<div class="tt-row"><span>${cor ? `<i class="sw" style="--c:${cor}"></i>` : ''}${nome}</span><b>${valor}</b></div>`;

const nota = (extra = '') => Api.demo()
  ? `<p class="footnote">Valores ilustrativos para o protótipo${extra}. Configure a API em <a href="#configuracoes">Configurações</a> para usar os dados reais do banco.</p>`
  : '';

function statusMeta(razao) {
  if (razao <= 0.9) return { cls: 'good', icon: '✓', txt: 'Dentro da meta' };
  if (razao <= 1) return { cls: 'warn', icon: '!', txt: 'Perto da meta' };
  return { cls: 'over', icon: '▲', txt: 'Acima da meta' };
}

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
  const ops = mensal.filter(m => m.completo).slice(-12).reverse().map(m => [m.mes, cap(mesLongo(m.mes))]);
  dialogo({
    titulo: 'Lançar conta de luz',
    descricao: 'Digite o consumo em kWh impresso na conta da concessionária.',
    campos: [
      { name: 'mes', label: 'Mês da conta', options: ops, value: ops[0][0] },
      { name: 'kwh', label: 'Consumo na conta (kWh)', type: 'number', step: '1', min: 0 },
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
  return { mA, mD, nAntes: antes.length, variacao: mA && mD ? mD / mA - 1 : null };
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
  return { inicio: bi, fim: bi + 2, dispositivo: dom };
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
  const gasto = kwh * preco;
  const contaKwh = atual ? prev.kwh_previsto : kwh;
  const conta = contaKwh * preco;
  const st = statusMeta(conta / s.meta);
  const escala = Math.max(s.meta, (atual ? prev.kwh_max : kwh) * preco) * 1.06;
  const w = v => `${Math.min(100, (v / escala) * 100).toFixed(1)}%`;
  const circ = disp
    .map(d => ({ ...d, kwh: sum(doMes.map(x => x.por_dispositivo[d.id] || 0)) }))
    .sort((a, b) => b.kwh - a.kwh);
  const iSel = mensal.findIndex(m => m.mes === mes);
  const ult6 = mensal.slice(Math.max(0, iSel - 5), iSel + 1);
  const ad = antesDepois(mensal);
  const pico = picoHorario(perfil);
  const temChuveiro = disp.some(d => d.id === 'chuveiro');
  const econ5 = mediaDiaria(diario, 'chuveiro') * (5 / BANHO_MIN) * 30 * preco;
  const domNome = nomeDe(disp.find(d => d.id === pico.dispositivo) || { id: pico.dispositivo, nome: pico.dispositivo });

  const frase = atual
    ? `A conta de ${mesNome(mes)} deve ficar em torno de <b>${brl0(conta)}</b>.`
    : `Em ${mesNome(mes)} o consumo custou <b>${brl0(conta)}</b>.`;
  const detalhe = atual
    ? `Sua meta é ${brl(s.meta)}. Até hoje foram ${nf(kwh, 1)} kWh, o que equivale a ${brl(gasto)} em ${doMes.length} de ${diasNoMes(mes)} dias.`
    : `Sua meta é ${brl(s.meta)}. Foram ${nf(kwh, 1)} kWh medidos ao longo do mês.`;

  root.innerHTML = `
    ${pageHead({
      eyebrow: `Olá, ${esc(ses.nome || 'usuário')}`,
      titulo: cap(mesLongo(mes)),
      acoes: `
        <label class="inline-label">Mês
          <select id="sel-mes">${mesesSis.slice().reverse().map(k => `<option value="${k}" ${k === mes ? 'selected' : ''}>${cap(mesLongo(k))}</option>`).join('')}</select>
        </label>
        <button type="button" class="btn dark" id="btn-export">Exportar relatório</button>`,
    })}

    <div class="statusbar">
      <span><i class="dot-on"></i>Sensores funcionando · atualizado <span id="rt-ago">agora</span></span>
      <span>Consumo neste instante: <b class="mono" id="rt-kw">—</b></span>
    </div>

    <article class="card hero">
      <p class="status ${st.cls}"><span class="status-icon" aria-hidden="true">${st.icon}</span>${st.txt}</p>
      <h2 class="hero-title">${frase}</h2>
      <p class="hero-sub">${detalhe}</p>
      <div class="meter" role="img" aria-label="Gasto ${brl(gasto)}, conta ${brl(conta)}, meta ${brl(s.meta)}">
        ${atual ? `<div class="meter-prev" style="width:${w(conta)}"></div>` : ''}
        <div class="meter-now ${st.cls}" style="width:${w(gasto)}"></div>
        <div class="meter-goal" style="left:${w(s.meta)}"><span>meta ${brl0(s.meta)}</span></div>
      </div>
      ${legenda(atual
        ? [['', 'var(--g-700)', `Gasto até hoje (${brl(gasto)})`], ['', 'var(--g-300)', `Previsão até o fim do mês (${brl(conta)})`]]
        : [['', 'var(--g-700)', `Gasto no mês (${brl(gasto)})`]])}
    </article>

    <section class="grid-2">
      <article class="card">
        ${cardHead('Onde a energia foi gasta', `Consumo de cada circuito em ${mesNome(mes)}`, '<a class="link" href="#equipamentos">Ver equipamentos</a>')}
        <ul class="circuits">${circ.map((d, i) => `
          <li>
            <div class="c-top"><span>${esc(nomeDe(d))}</span><span class="c-val"><b>${brl(d.kwh * preco)}</b> · ${pct(kwh ? d.kwh / kwh : 0, 0)}</span></div>
            <div class="track"><div style="width:${kwh ? (d.kwh / kwh * 100).toFixed(1) : 0}%;background:${RANK[Math.min(3, i)]}"></div></div>
          </li>`).join('')}
        </ul>
        <p class="callout"><b>Dica:</b> ${esc(domNome)} é o que mais pesa no horário de pico, entre ${pico.inicio}h e ${pico.fim}h.${temChuveiro ? ` Reduzir 5 minutos em cada banho economiza cerca de ${brl(econ5)} por mês.` : ''}</p>
      </article>
      <article class="card">
        ${cardHead('Últimos meses', 'Consumo em kWh', legenda([['', 'var(--g-700)', 'Consumo'], ...(ult6.some(m => m.mes === prev.mes) ? [['ghost', 'var(--orange)', 'Previsão']] : [])]))}
        <div id="ch-mensal"></div>
        ${ad.variacao != null ? `<p class="delta-line"><span class="badge ${ad.variacao <= 0 ? 'good' : 'bad'}">${sinal(ad.variacao)}</span>
          <span>${ad.variacao <= 0 ? 'de redução' : 'de aumento'} no consumo médio desde que o sistema foi instalado. <a href="#historico">Ver comparação</a></span></p>` : ''}
      </article>
    </section>
    ${nota()}`;

  chart('mensal', () => Charts.bar($('#ch-mensal'), {
    ariaLabel: 'Consumo dos últimos meses em kWh',
    height: 210,
    axis: false,
    valueLabels: true,
    valueFormat: v => nf(v),
    labels: ult6.map(m => mesAbrev(m.mes)),
    values: ult6.map(valorMes),
    color: 'var(--g-700)',
    ghost: ult6.map(m => (m.mes === prev.mes ? prev.kwh_previsto : null)),
    boldIndex: ult6.length - 1,
    tip: i => {
      const m = ult6[i];
      const prevista = m.mes === prev.mes;
      return `<div class="tt-title">${cap(mesLongo(m.mes))}</div>
        ${tipRow(prevista ? 'Até hoje' : 'Consumo', `${nf(valorMes(m))} kWh`)}
        ${prevista ? tipRow('Previsão', `${nf(prev.kwh_previsto)} kWh`) : ''}
        ${tipRow('Fonte', m.com_sistema ? 'sistema' : 'conta de luz')}`;
    },
  }));

  $('#sel-mes').addEventListener('change', e => { mesSel = e.target.value; render(); });
  $('#btn-export').addEventListener('click', () => window.print());

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
  const pico = picoHorario(perfil);
  const maxPerfil = Math.max(...perfil.horas.map(h => h.kwh));
  const registros = mensal.filter(m => m.completo).slice(-12).reverse();
  const ad = antesDepois(mensal);
  const comparativo = mensal.filter(m => m.com_sistema && m.completo).reverse();

  root.innerHTML = `
    ${pageHead({
      titulo: 'Histórico',
      lede: 'Como o consumo da casa mudou ao longo do tempo e se o sistema ajudou a economizar.',
    })}

    <article class="card">
      <div class="card-head">
        <div><h2 id="main-title"></h2><p class="card-sub" id="main-sub"></p></div>
        <div class="seg" role="group" aria-label="Ver por">
          ${[['mensal', 'Por mês'], ['diario', 'Por dia'], ['hora', 'Por hora']].map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === histModo}">${t}</button>`).join('')}
        </div>
      </div>
      <div id="main-legend"></div>
      <div id="ch-main"></div>
      <div id="main-minis"></div>
    </article>

    <section class="grid-2">
      <article class="card">
        ${cardHead('Antes e depois do sistema', `Média mensal dos ${ad.nAntes} meses antes da instalação comparada à média depois dela`)}
        <div class="minis">
          ${mini('Antes (conta de luz)', ad.mA ? `${nf(ad.mA)} kWh` : '—')}
          ${mini('Depois (sistema)', ad.mD ? `${nf(ad.mD)} kWh` : '—')}
        </div>
        ${ad.variacao != null
          ? `<p class="delta-line"><span class="badge ${ad.variacao <= 0 ? 'good' : 'bad'}">${sinal(ad.variacao)}</span><span>${ad.variacao <= 0 ? 'redução' : 'aumento'} no consumo médio mensal, cerca de ${brl(Math.abs(ad.mA - ad.mD) * preco)} por mês.</span></p>`
          : '<p class="muted">A comparação aparece ao fim do primeiro mês completo com o sistema.</p>'}
      </article>
      <article class="card">
        ${cardHead('Sistema × conta de luz', 'Confira se o que o sistema mediu bate com a conta da concessionária')}
        <div class="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Sistema</th><th>Conta de luz</th><th>Diferença</th></tr></thead>
          <tbody>${comparativo.map(m => {
            const f = fatKwh(m);
            return `<tr><td>${mesAno(m.mes)}</td><td class="mono">${nf(m.kwh_sensores)} kWh</td>
              <td class="mono">${f ? `${nf(f)} kWh` : '—'}</td><td class="mono">${f ? pct(Math.abs(m.kwh_sensores - f) / f) : '—'}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Sem meses completos ainda.</td></tr>'}</tbody>
        </table></div>
        <button type="button" class="link-btn" id="btn-fatura">Lançar uma nova conta de luz</button>
      </article>
    </section>

    <article class="card">
      ${cardHead('Em que horário a casa mais consome', `Média de cada hora do dia em ${mesNome(perfil.mes)}. O pico fica entre ${pico.inicio}h e ${pico.fim}h, destacado em preto.`)}
      <div id="ch-perfil"></div>
    </article>

    <details class="card disclosure">
      <summary>Tabela com todos os meses</summary>
      <div class="disclosure-body">
        <div class="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Consumo</th><th>Custo estimado</th><th>Vs. mês anterior</th><th>Fonte</th></tr></thead>
          <tbody>${registros.map(m => {
            const i = mensal.indexOf(m);
            const ant = i > 0 ? valorMes(mensal[i - 1]) : null;
            const v = ant ? valorMes(m) / ant - 1 : null;
            return `<tr><td>${mesAno(m.mes)}</td><td class="mono">${nf(valorMes(m))} kWh</td><td class="mono">${brl(valorMes(m) * preco)}</td>
              <td class="mono ${v == null ? '' : v <= 0 ? 'green' : 'red'}">${v == null ? '—' : sinal(v)}</td><td>${m.com_sistema ? 'Sistema' : 'Conta de luz'}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
        <button type="button" class="btn" id="btn-csv">Baixar CSV</button>
      </div>
    </details>
    ${nota(` com tarifa de ${brl(preco)}/kWh`)}`;

  function drawMain() {
    const set = (titulo, sub, leg, minis) => {
      $('#main-title').textContent = titulo;
      $('#main-sub').textContent = sub;
      $('#main-legend').innerHTML = leg;
      $('#main-minis').innerHTML = minis ? `<div class="minis minis-3">${minis}</div>` : '';
    };

    if (histModo === 'mensal') {
      const lista = mensal.slice(-12);
      const iInst = lista.findIndex(m => m.com_sistema);
      set('Consumo por mês', 'Últimos 12 meses, em kWh. A linha tracejada marca a instalação do sistema.',
        legenda([['', 'var(--bar-before)', 'Conta de luz (antes do sistema)'], ['', 'var(--g-700)', 'Medido pelo sistema'], ['ghost', 'var(--orange)', 'Previsão do mês atual']]));
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
        tip: i => `<div class="tt-title">${cap(mesLongo(lista[i].mes))}</div>
          ${tipRow(lista[i].mes === prev.mes ? 'Até hoje' : 'Consumo', `${nf(valorMes(lista[i]))} kWh`)}
          ${lista[i].mes === prev.mes ? tipRow('Previsão', `${nf(prev.kwh_previsto)} kWh`) : tipRow('Custo estimado', brl(valorMes(lista[i]) * preco))}`,
      }));
    } else if (histModo === 'diario') {
      const dias = diario.slice(-31, -1);
      const vals = dias.map(d => d.total_kwh);
      const iMax = vals.indexOf(Math.max(...vals));
      set('Consumo por dia', 'Últimos 30 dias, em kWh.', '',
        mini('Média por dia', `${nf(sum(vals) / vals.length, 1)} kWh`)
        + mini('Dia de maior consumo', `${ddmm(dias[iMax].data)} · ${nf(vals[iMax], 1)} kWh`)
        + mini('Gasto médio por dia', brl((sum(vals) / vals.length) * preco)));
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
      set('Consumo por hora', 'Últimas 24 horas, em kWh.', '',
        mini('Total nas últimas 24 h', `${nf(sum(vals), 1)} kWh`)
        + mini('Hora de maior consumo', `${horaMin(horas[iMax].t)} · ${nf(vals[iMax], 2)} kWh`)
        + mini('Custo nas últimas 24 h', brl(sum(vals) * preco)));
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
    tip: i => `<div class="tt-title">${i}h às ${i + 1}h</div>${tipRow('Média', `${nf(perfil.horas[i].kwh, 2)} kWh`)}`,
  }));

  root.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    histModo = b.dataset.k;
    root.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawMain();
  }));
  $('#btn-fatura').addEventListener('click', () => lancarFatura(mensal));
  $('#btn-csv').addEventListener('click', () => baixarCSV('registros-mensais.csv', [
    ['Mês', 'Consumo (kWh)', 'Custo estimado (R$)', 'Fonte'],
    ...registros.map(m => [m.mes, nf(valorMes(m)), nf(valorMes(m) * preco, 2), m.com_sistema ? 'Sistema' : 'Conta de luz']),
  ]));
  drawMain();
}

/* ---------- Equipamentos ---------- */

async function viewEquipamentos(root) {
  const [disp, diario, picos] = await Promise.all(['dispositivos', 'diario', 'picos'].map(Api.get));
  const preco = precoKwh();
  const mes = diario[diario.length - 1].data.slice(0, 7);
  const doMes = diario.filter(d => d.data.startsWith(mes));
  const total = sum(doMes.map(d => d.total_kwh));
  const circ = disp
    .map(d => ({ ...d, kwh: sum(doMes.map(x => x.por_dispositivo[d.id] || 0)) }))
    .sort((a, b) => b.kwh - a.kwh);
  const novos = SensoresNovos.get();
  const fmtDur = m => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const nomeId = id => nomeDe(disp.find(d => d.id === id) || { id, nome: id });
  const quando = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${horaMin(iso)}`; };

  root.innerHTML = `
    ${pageHead({
      titulo: 'Equipamentos',
      lede: `Quanto cada parte da casa consumiu em ${mesNome(mes)}, do que mais gasta para o que menos gasta.`,
      acoes: '<button type="button" class="btn dark" id="btn-add">+ Adicionar sensor</button>',
    })}
    <section class="devices">
      ${circ.map((d, i) => `
        <article class="card device" data-id="${d.id}">
          <div class="dev-top">
            <h3 class="dev-name">${esc(nomeDe(d))}</h3>
            <span class="chip">—</span>
          </div>
          <div class="dev-money"><b class="mono">${brl(d.kwh * preco)}</b><span>em ${mesNome(mes)}</span></div>
          <div class="track"><div style="width:${total ? (d.kwh / total * 100).toFixed(1) : 0}%;background:${RANK[Math.min(3, i)]}"></div></div>
          <p class="dev-detail">${nf(d.kwh, 1)} kWh · ${pct(total ? d.kwh / total : 0, 0)} do consumo da casa</p>
          <div class="dev-foot">
            <span>Agora: <b class="mono pw">—</b></span>
            <button type="button" class="link-btn" data-rename="${d.id}">Renomear</button>
          </div>
          <p class="dev-ch">Sensor ${d.canal} · pino GPIO ${d.gpio}</p>
        </article>`).join('')}
      ${novos.map(n => `
        <article class="card device pending">
          <div class="dev-top"><h3 class="dev-name">${esc(n.nome)}</h3><span class="chip">Aguardando</span></div>
          <p class="muted">As leituras aparecem aqui assim que o ESP32 começar a enviá-las.</p>
          <p class="dev-ch">Sensor ${esc(n.canal)} · pino GPIO ${esc(n.gpio)}</p>
        </article>`).join('')}
    </section>

    <article class="card">
      ${cardHead('Momentos de maior consumo', `Os maiores picos de potência registrados em ${mesNome(mes)}`)}
      <div class="table-wrap"><table>
        <thead><tr><th>Quando</th><th>Equipamento</th><th>Potência máxima</th><th>Duração</th></tr></thead>
        <tbody>${picos.map(p => `<tr><td>${quando(p.inicio)}</td><td>${esc(nomeId(p.dispositivo_id))}</td>
          <td class="mono">${nf(p.pico_w)} W</td><td class="mono">${fmtDur(p.duracao_min)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem picos registrados neste mês.</td></tr>'}</tbody>
      </table></div>
    </article>
    ${nota()}`;

  root.querySelectorAll('[data-rename]').forEach(b => b.addEventListener('click', () => {
    const d = disp.find(x => x.id === b.dataset.rename);
    dialogo({
      titulo: 'Renomear circuito',
      campos: [{ name: 'nome', label: `Nome do circuito ligado ao sensor ${d.canal}`, value: nomeDe(d) }],
      onSubmit: v => { const n = Nomes.get(); n[d.id] = v.nome.trim() || d.nome; Nomes.set(n); render(); },
    });
  }));
  $('#btn-add').addEventListener('click', () => {
    dialogo({
      titulo: 'Adicionar sensor',
      descricao: 'Cadastre um novo sensor de corrente ligado ao ESP32.',
      campos: [
        { name: 'nome', label: 'O que ele mede', placeholder: 'Ex.: Máquina de lavar' },
        { name: 'canal', label: 'Nome do sensor', value: `CT${disp.length + novos.length + 1}` },
        { name: 'gpio', label: 'Pino GPIO do ESP32', type: 'number', min: 0, step: '1' },
      ],
      enviar: 'Adicionar',
      onSubmit: v => { SensoresNovos.set([...novos, v]); render(); },
    });
  });

  every(3000, async () => {
    try {
      const rt = await Api.get('tempoReal');
      for (const [id, w] of Object.entries(rt.por_dispositivo)) {
        const card = root.querySelector(`.device[data-id="${id}"]`);
        if (!card) continue;
        const ligado = w > 20;
        card.querySelector('.pw').textContent = `${nf(w)} W`;
        const chip = card.querySelector('.chip');
        chip.textContent = ligado ? 'Ligado' : 'Desligado';
        chip.classList.toggle('on', ligado);
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
  const ontem = prev.real[prev.real.length - 1];
  const conta = prev.kwh_previsto * preco;
  const folga = s.meta - conta;
  const metaKwh = s.meta / preco;
  const restantes = n - ontem.dia;
  const temChuveiro = disp.some(d => d.id === 'chuveiro');
  const chuvDia = mediaDiaria(diario, 'chuveiro');
  const [y, m] = partes(prev.mes);

  root.innerHTML = `
    ${pageHead({
      eyebrow: `Fechamento em ${dataBr(`${y}-${String(m).padStart(2, '0')}-${n}`)}`,
      titulo: 'Previsão da conta',
      lede: `Se o consumo continuar no ritmo atual, a conta de ${mesNome(prev.mes)} deve ficar entre <b>${brl(prev.kwh_min * preco)}</b> e <b>${brl(prev.kwh_max * preco)}</b>.`,
    })}
    <section class="tiles tiles-3">
      ${tile({ cls: 'dark', label: 'Conta prevista', value: brl(conta), foot: `${nf(prev.kwh_previsto)} kWh no mês` })}
      ${tile({ label: 'Sua meta', value: brl(s.meta), foot: folga >= 0 ? `<span class="green">sobram ${brl(folga)}</span>` : `<span class="red">passa ${brl(-folga)} da meta</span>` })}
      ${tile({ label: 'Dias até o fechamento', value: nf(restantes), foot: `de ${n} dias no mês` })}
    </section>

    <article class="card">
      ${cardHead('Consumo acumulado no mês', 'Quanto já foi consumido e para onde o consumo vai até o fim do mês, em kWh',
        legenda([['line', 'var(--g-700)', 'Já consumido'], ['dashed', 'var(--orange)', 'Previsão'], ['band', 'var(--band)', 'Faixa provável'], ['line', 'var(--meta)', 'Meta']]))}
      <div id="ch-prev"></div>
    </article>

    <section class="grid-2">
      <article class="card">
        ${cardHead('Simular economia', 'Quanto a conta cai se os banhos forem mais curtos até o fim do mês')}
        ${temChuveiro ? `
          <p class="muted">Diminuir cada banho em:</p>
          <div class="choice" role="group" aria-label="Redução por banho">
            ${[[0, 'Nada'], [2, '2 min'], [5, '5 min'], [8, '8 min']].map(([v, t]) => `<button type="button" data-min="${v}" aria-pressed="${v === banhoMin}">${t}</button>`).join('')}
          </div>
          <div class="minis" id="sim-out"></div>
          <p class="footnote">Cálculo com base no consumo do chuveiro nas últimas 4 semanas, considerando banhos de ${BANHO_MIN} minutos.</p>`
        : '<p class="muted">A simulação usa o sensor do chuveiro, que não está cadastrado.</p>'}
      </article>
      <article class="card">
        ${cardHead('Como a previsão é calculada')}
        <p class="body-text">O sistema olha o consumo de cada dia da semana nas últimas 4 semanas e projeta os dias que faltam. A previsão é refeita sempre que o ESP32 envia novas leituras.</p>
        <p class="body-text">Em testes com os meses anteriores, a previsão errou em média <b>${prev.mae_kwh != null ? `${nf(prev.mae_kwh, 1)} kWh` : '—'}</b>${prev.mae_kwh != null ? ` (cerca de ${brl(prev.mae_kwh * preco)})` : ''}.</p>
        <details class="tech">
          <summary>Detalhes técnicos</summary>
          <dl class="kv">
            <div><dt>Algoritmo</dt><dd>${esc(prev.modelo)}</dd></div>
            <div><dt>Variáveis</dt><dd>${esc(prev.variaveis)}</dd></div>
            <div><dt>Dados de treino</dt><dd>leituras desde ${dataBr(prev.treino_desde)}</dd></div>
            <div><dt>Erro absoluto médio (EAM)</dt><dd class="mono">${prev.mae_kwh != null ? `${nf(prev.mae_kwh, 2)} kWh` : '—'}${prev.mape != null ? ` · ${pct(prev.mape)}` : ''}</dd></div>
            <div><dt>Último treino</dt><dd>${dataBr(prev.ultimo_treino)}</dd></div>
          </dl>
        </details>
      </article>
    </section>
    ${nota(` com tarifa de ${brl(preco)}/kWh`)}`;

  const ticks = [];
  for (let d = 1; d <= n; d += 5) ticks.push(d);
  if (ticks[ticks.length - 1] !== n) ticks.push(n);

  chart('prev', () => Charts.line($('#ch-prev'), {
    ariaLabel: 'Consumo acumulado e previsão no mês',
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
      { i: ontem.dia, v: ontem.kwh_acumulado, color: 'var(--g-700)', label: `Até ontem: ${nf(ontem.kwh_acumulado, 1)} kWh`, dx: 10, dy: 22 },
      { i: n, v: prev.kwh_previsto, color: 'var(--orange)', label: `${nf(prev.kwh_previsto)} kWh`, dx: -10, dy: 26, anchor: 'end', labelColor: 'var(--orange)' },
    ],
    yFormat: v => nf(v),
    tip: i => `<div class="tt-title">Dia ${i}</div>
      ${real[i] != null ? tipRow('Já consumido', `${nf(real[i], 1)} kWh`, 'var(--g-700)') : ''}
      ${pv[i] != null && i > ontem.dia ? tipRow('Previsão', `${nf(pv[i], 1)} kWh`, 'var(--orange)') : ''}
      ${pv[i] != null && i > ontem.dia ? tipRow('Faixa provável', `${nf(lo[i])} a ${nf(hi[i])} kWh`) : ''}`,
  }));

  function simular() {
    const out = $('#sim-out');
    if (!out) return;
    const econ = chuvDia * (banhoMin / BANHO_MIN) * restantes * preco;
    out.innerHTML = mini('Economia até o fim do mês', brl(econ), 'good') + mini('Nova previsão da conta', brl(conta - econ));
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
  const [esp, disp, h24, calib] = await Promise.all(['esp32', 'dispositivos', 'ultimas24h', 'calibracao'].map(Api.get));
  const entrega = esp.pacotes_recebidos_24h / esp.pacotes_esperados_24h;
  const seg = (Date.now() - new Date(esp.ligado_desde)) / 1000;
  const ligado = `${Math.floor(seg / 86400)} d ${Math.floor((seg % 86400) / 3600)} h`;
  const qualidade = esp.rssi_dbm >= -60 ? 'excelente' : esp.rssi_dbm >= -70 ? 'bom' : 'fraco';
  const calLocal = Calibracoes.get();
  const sensoresCal = calib.sensores.map(c => ({ ...c, ...(calLocal[c.canal] || {}) }));
  const ultimaCal = Object.values(calLocal).map(c => c.data).concat(calib.ultima).sort().pop();
  const nomeCanal = canal => { const d = disp.find(x => x.canal === canal); return d ? nomeDe(d) : canal; };

  root.innerHTML = `
    ${pageHead({
      eyebrow: `${esc(esp.id)} · firmware ${esc(esp.firmware)}`,
      titulo: 'Dispositivo ESP32',
      lede: esp.online
        ? 'O medidor instalado no quadro de energia está <b class="green">funcionando normalmente</b>. Os detalhes abaixo são técnicos e ajudam a conferir a instalação.'
        : 'O medidor instalado no quadro de energia está <b class="red">sem comunicação</b>. Verifique a energia e o Wi-Fi do ESP32.',
    })}
    <section class="tiles">
      ${tile({ label: 'Status', value: `<span class="${esp.online ? 'green' : 'red'}">${esp.online ? 'Online' : 'Offline'}</span>`, foot: `última leitura às ${new Date(esp.ultima_leitura).toLocaleTimeString('pt-BR')}` })}
      ${tile({ label: 'Sinal do Wi-Fi', value: cap(qualidade), foot: `${esp.rssi_dbm} dBm` })}
      ${tile({ label: 'Leituras recebidas (24 h)', value: pct(entrega), foot: `${nf(esp.pacotes_recebidos_24h)} de ${nf(esp.pacotes_esperados_24h)} enviadas` })}
      ${tile({ label: 'Ligado há', value: ligado, foot: 'desde a última reinicialização' })}
    </section>

    <article class="card">
      ${cardHead('Leituras chegando agora', `Potência medida por sensor, em watts. Uma nova leitura a cada ${esp.intervalo_envio_s} segundos.`)}
      <div class="table-wrap"><table>
        <thead><tr><th>Horário</th>${disp.map(d => `<th>${esc(nomeDe(d))}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody id="leituras"></tbody>
      </table></div>
    </article>

    <section class="grid-2">
      <article class="card">
        ${cardHead('Calibração dos sensores', `Erro de cada sensor comparado a um instrumento de referência. Última calibração em ${dataBr(ultimaCal)}.`)}
        <div class="table-wrap"><table>
          <thead><tr><th>Sensor</th><th>Fator</th><th>Referência</th><th>Erro</th></tr></thead>
          <tbody>${sensoresCal.map(c => `<tr><td>${c.canal} · ${esc(nomeCanal(c.canal))}</td>
            <td class="mono">${c.fator != null && c.fator !== '' ? esc(c.fator) : '<span class="muted">a definir</span>'}</td>
            <td>${esc(c.referencia)}</td><td class="mono">${nf(+c.erro_pct, 1)}%</td></tr>`).join('')}</tbody>
        </table></div>
        <button type="button" class="btn" id="btn-cal">Registrar nova calibração</button>
      </article>
      <article class="card">
        ${cardHead('Configuração')}
        <dl class="kv">
          <div><dt>Endereço IP</dt><dd class="mono">${esc(esp.ip)}</dd></div>
          <div><dt>Protocolo</dt><dd>${esc(esp.protocolo)}</dd></div>
          <div><dt>Endpoint</dt><dd class="mono">${esc(esp.endpoint)}</dd></div>
          <div><dt>Intervalo de envio</dt><dd>${esp.intervalo_envio_s} s</dd></div>
          <div><dt>Sensores</dt><dd>${disp.map(d => `${d.canal} no GPIO ${d.gpio}`).join(', ')}</dd></div>
        </dl>
      </article>
    </section>

    <article class="card">
      ${cardHead('Consumo total nas últimas 24 horas', 'Potência média a cada 15 minutos, em watts')}
      <div id="ch-24h"></div>
    </article>
    ${nota()}`;

  chart('24h', () => Charts.line($('#ch-24h'), {
    ariaLabel: 'Potência total nas últimas 24 horas',
    height: 220,
    labels: h24.map(p => horaMin(p.timestamp)),
    series: [{ color: 'var(--g-700)', values: h24.map(p => p.potencia_w) }],
    yFormat: v => nf(v),
    tip: i => `<div class="tt-title">${horaMin(h24[i].timestamp)}</div>${tipRow('Potência', `${nf(h24[i].potencia_w)} W`)}`,
  }));

  $('#btn-cal').addEventListener('click', () => dialogo({
    titulo: 'Registrar nova calibração',
    descricao: 'Ligue uma carga conhecida e compare a leitura do sensor com o instrumento de referência.',
    campos: [
      { name: 'canal', label: 'Sensor', options: sensoresCal.map(c => [c.canal, `${c.canal} · ${nomeCanal(c.canal)}`]), value: sensoresCal[0].canal },
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

  const linhas = [];
  every(3000, async () => {
    try {
      const rt = await Api.get('tempoReal');
      linhas.unshift(rt);
      linhas.length = Math.min(linhas.length, 6);
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
    ${pageHead({ titulo: 'Configurações', lede: 'Ajuste a tarifa e a meta usadas nos cálculos de custo.' })}
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
    main.innerHTML = `${pageHead({ titulo: 'Não foi possível carregar os dados' })}
      <article class="card"><p>${esc(err.message)}</p>
      <p class="muted">Verifique o endereço da API em <a href="#configuracoes">Configurações</a> ou deixe-o em branco para usar o modo demonstração.</p></article>`;
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

document.querySelectorAll('.brand-name').forEach(el => { el.textContent = NOME_SISTEMA; });
$('#btn-logout').addEventListener('click', () => { Sessao.clear(); location.hash = '#entrar'; });
window.addEventListener('hashchange', render);
render();
