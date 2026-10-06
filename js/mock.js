/*
 * Dados simulados.
 * Substituem o ESP32 + backend enquanto o hardware não está conectado.
 * Cada função devolve exatamente o formato JSON esperado da API real
 * (ver README.md), de modo que trocar para a API não exige mudar as telas.
 */
const Mock = (() => {
  // Início do uso do sistema pelo morador (marco do "antes x depois").
  const DATA_ADOCAO = new Date(2026, 7, 1);

  const DISPOSITIVOS = [
    { id: 'chuveiro',   nome: 'Chuveiro elétrico',    canal: 'CT1', potencia_nominal_w: 5500 },
    { id: 'ar',         nome: 'Ar-condicionado',      canal: 'CT2', potencia_nominal_w: 1200 },
    { id: 'geladeira',  nome: 'Geladeira',            canal: 'CT3', potencia_nominal_w: 150 },
    { id: 'lavar',      nome: 'Máquina de lavar',     canal: 'CT4', potencia_nominal_w: 500 },
    { id: 'iluminacao', nome: 'Iluminação e tomadas', canal: 'CT5', potencia_nominal_w: 300 },
  ];

  // Sazonalidade de Brasília: seca e calor em set–out, frio em jun–jul (índice = mês 0..11).
  const AR_HORAS    = [2.2, 2.4, 2.0, 1.6, 1.0, 0.5, 0.4, 0.8, 2.0, 3.2, 3.0, 2.4];
  const BANHO_FATOR = [0.9, 0.9, 0.95, 1, 1.1, 1.2, 1.25, 1.15, 1, 0.95, 0.9, 0.9];

  // Potência média (W) por hora do dia, usada no gráfico de 24 h e na leitura "ao vivo".
  const PERFIL = {
    chuveiro:   h => (h === 6 || h === 7) ? 700 : (h >= 19 && h <= 21) ? 450 : h === 12 ? 150 : 0,
    ar:         h => (h >= 13 && h <= 17) ? 500 : (h >= 21 || h <= 1) ? 300 : 0,
    geladeira:  () => 50,
    lavar:      h => (h >= 9 && h <= 11) ? 100 : 0,
    iluminacao: h => (h >= 18 && h <= 23) ? 180 : (h >= 7 && h <= 17) ? 40 : 20,
  };

  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = d => dayKey(d).slice(0, 7);
  const sum = a => a.reduce((s, v) => s + v, 0);
  const r2 = v => Math.round(v * 100) / 100;
  const r3 = v => Math.round(v * 1000) / 1000;

  function kwhDia(d, r) {
    const pos = d >= DATA_ADOCAO;
    const m = d.getMonth();
    const fds = d.getDay() === 0 || d.getDay() === 6;
    return {
      chuveiro:   5.5 * (0.42 + r() * 0.18) * BANHO_FATOR[m] * (fds ? 1.15 : 1) * (pos ? 0.85 : 1),
      ar:         1.2 * AR_HORAS[m] * (0.6 + r() * 0.8) * (fds ? 1.3 : 1) * (pos ? 0.84 : 1),
      geladeira:  1.0 + r() * 0.25 + (m >= 8 && m <= 10 ? 0.15 : 0),
      lavar:      (fds || r() < 0.15) ? 0.5 + r() * 0.4 : 0.02,
      iluminacao: (1.6 + r() * 0.6) * (fds ? 1.2 : 1) * (pos ? 0.9 : 1),
    };
  }

  // 24 meses de histórico diário até hoje (o dia de hoje é parcial).
  let cache;
  function base() {
    if (cache) return cache;
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 24, 1);
    const r = rng(20260801);
    const fracHoje = (hoje.getHours() * 60 + hoje.getMinutes()) / 1440;
    const dias = [];
    for (let d = new Date(inicio); d <= hoje; d.setDate(d.getDate() + 1)) {
      const k = kwhDia(d, r);
      if (dayKey(d) === dayKey(hoje)) for (const id in k) k[id] *= fracHoje;
      dias.push({ data: dayKey(d), date: new Date(d), por: k, total: sum(Object.values(k)) });
    }
    cache = { hoje, dias };
    return cache;
  }

  function dispositivos() {
    const agora = new Date().toISOString();
    return DISPOSITIVOS.map(d => ({ ...d, online: true, ultima_leitura: agora }));
  }

  const estado = {};
  function tempoReal() {
    const t = new Date();
    const h = t.getHours();
    const por = {};
    for (const d of DISPOSITIVOS) {
      const media = PERFIL[d.id](h);
      if (d.id === 'iluminacao') { por[d.id] = Math.round(media * (0.85 + Math.random() * 0.3)); continue; }
      const pLigado = d.id === 'geladeira' ? 0.35 : Math.min(0.95, media / d.potencia_nominal_w);
      if (estado[d.id] === undefined || Math.random() < 0.12) estado[d.id] = Math.random() < pLigado;
      por[d.id] = estado[d.id] ? Math.round(d.potencia_nominal_w * (0.93 + Math.random() * 0.1)) : 0;
    }
    return { timestamp: t.toISOString(), potencia_total_w: sum(Object.values(por)), por_dispositivo: por };
  }

  function ultimas24h() {
    const passo = 15 * 60 * 1000;
    const fim = Math.floor(Date.now() / passo) * passo;
    const pontos = [];
    for (let t = fim - 95 * passo; t <= fim; t += passo) {
      const r = rng(t / passo);
      const h = new Date(t).getHours();
      const w = sum(DISPOSITIVOS.map(d => PERFIL[d.id](h) * (0.5 + r())));
      pontos.push({ timestamp: new Date(t).toISOString(), potencia_w: Math.round(w) });
    }
    return pontos;
  }

  function diario() {
    return base().dias
      .filter(d => d.date >= DATA_ADOCAO)
      .map(d => ({
        data: d.data,
        total_kwh: r3(d.total),
        por_dispositivo: Object.fromEntries(Object.entries(d.por).map(([k, v]) => [k, r3(v)])),
      }));
  }

  function mensal() {
    const { dias, hoje } = base();
    const r = rng(77);
    const meses = new Map();
    for (const d of dias) {
      const m = d.data.slice(0, 7);
      meses.set(m, (meses.get(m) || 0) + d.total);
    }
    return [...meses].map(([mes, kwh]) => {
      const [y, mm] = mes.split('-').map(Number);
      const completo = mes !== monthKey(hoje);
      const comSistema = new Date(y, mm - 1, 1) >= DATA_ADOCAO;
      // Leitura do medidor da concessionária: difere um pouco do que os sensores CT registram.
      const fatura = kwh * (1 + (r() - 0.5) * 0.05);
      return {
        mes,
        completo,
        com_sistema: comSistema,
        kwh_sensores: comSistema ? r2(kwh) : null,
        kwh_fatura: completo ? Math.round(fatura) : null,
      };
    });
  }

  function previsao() {
    const { dias, hoje } = base();
    const iAdocao = Math.max(0, dias.findIndex(d => d.date >= DATA_ADOCAO));
    const mes = monthKey(hoje);
    const iMes = dias.findIndex(d => d.data.startsWith(mes));
    const iHoje = dias.length - 1; // hoje ainda está em andamento: entra na previsão
    const nDias = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();

    // Modelo: média por dia da semana nos 28 dias anteriores ao ponto de corte.
    function ajustar(idx) {
      const ini = Math.max(iAdocao, idx - 28);
      const soma = Array(7).fill(0), n = Array(7).fill(0);
      let tot = 0, cnt = 0;
      for (let i = ini; i < idx; i++) {
        const w = dias[i].date.getDay();
        soma[w] += dias[i].total; n[w]++; tot += dias[i].total; cnt++;
      }
      const geral = cnt ? tot / cnt : 0;
      const media = soma.map((v, w) => n[w] ? v / n[w] : geral);
      let sq = 0;
      for (let i = ini; i < idx; i++) sq += (dias[i].total - media[dias[i].date.getDay()]) ** 2;
      return { media, sigma: cnt > 1 ? Math.sqrt(sq / (cnt - 1)) : geral * 0.3 };
    }

    const modelo = ajustar(iHoje);
    let acum = 0;
    const real = [{ dia: 0, kwh_acumulado: 0 }];
    for (let i = iMes; i < iHoje; i++) {
      acum += dias[i].total;
      real.push({ dia: i - iMes + 1, kwh_acumulado: r2(acum) });
    }
    const previsto = [{ dia: iHoje - iMes, kwh_acumulado: r2(acum), min: r2(acum), max: r2(acum) }];
    let p = acum, k = 0;
    for (let d = iHoje - iMes + 1; d <= nDias; d++) {
      p += modelo.media[new Date(hoje.getFullYear(), hoje.getMonth(), d).getDay()];
      // Faixa de ~80%. Expoente 0,75 (e não 0,5) porque erros de dias seguidos são correlacionados.
      const z = 1.28 * modelo.sigma * (++k) ** 0.75;
      previsto.push({ dia: d, kwh_acumulado: r2(p), min: r2(Math.max(acum, p - z)), max: r2(p + z) });
    }

    // Validação retroativa: prevê cada mês completo a partir de cada dia e compara com o total real.
    const erros = [], errosPct = [];
    for (let i0 = iAdocao; i0 < iMes;) {
      const ym = dias[i0].data.slice(0, 7);
      let i1 = i0;
      while (i1 < dias.length && dias[i1].data.startsWith(ym)) i1++;
      const total = sum(dias.slice(i0, i1).map(d => d.total));
      for (let c = Math.max(i0 + 1, iAdocao + 7); c < i1; c++) {
        const mm = ajustar(c);
        let est = sum(dias.slice(i0, c).map(d => d.total));
        for (let j = c; j < i1; j++) est += mm.media[dias[j].date.getDay()];
        erros.push(Math.abs(est - total));
        errosPct.push(Math.abs(est - total) / total);
      }
      i0 = i1;
    }
    const ult = previsto[previsto.length - 1];
    return {
      mes,
      modelo: 'Média por dia da semana (janela de 28 dias)',
      dias_no_mes: nDias,
      kwh_previsto: ult.kwh_acumulado,
      kwh_min: ult.min,
      kwh_max: ult.max,
      mae_kwh: erros.length ? r2(sum(erros) / erros.length) : null,
      mape: errosPct.length ? sum(errosPct) / errosPct.length : null,
      real,
      previsto,
    };
  }

  return { dispositivos, tempoReal, ultimas24h, diario, mensal, previsao };
})();
