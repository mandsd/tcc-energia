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
    { id: 'chuveiro', nome: 'Chuveiro',        canal: 'CT1', gpio: 34, potencia_nominal_w: 5500 },
    { id: 'ar',       nome: 'Ar-condicionado', canal: 'CT2', gpio: 35, potencia_nominal_w: 1200 },
    { id: 'cozinha',  nome: 'Cozinha',         canal: 'CT3', gpio: 32, potencia_nominal_w: 1250, descricao: 'geladeira, micro-ondas' },
    { id: 'tomadas',  nome: 'Tomadas e iluminação', canal: 'CT4', gpio: 33, potencia_nominal_w: 600 },
  ];

  // Sazonalidade de Brasília: seca e calor em set–out, frio em jun–jul (índice = mês 0..11).
  const AR_HORAS    = [1.6, 1.8, 1.5, 1.2, 0.8, 0.4, 0.3, 0.6, 1.5, 2.4, 2.2, 1.8];
  const BANHO_FATOR = [0.9, 0.9, 0.95, 1, 1.1, 1.2, 1.25, 1.15, 1, 0.95, 0.9, 0.9];

  // Potência média (W) por hora do dia, usada no perfil horário, no gráfico de 24 h e na leitura "ao vivo".
  const PERFIL = {
    chuveiro: h => (h === 6 || h === 7) ? 600 : (h >= 19 && h <= 21) ? 520 : h === 12 ? 120 : 0,
    ar:       h => (h >= 13 && h <= 17) ? 380 : (h >= 21 || h <= 1) ? 220 : 0,
    cozinha:  h => 50 + (h === 12 || h === 19 ? 220 : h === 7 ? 110 : 0),
    tomadas:  h => (h >= 18 && h <= 23) ? 200 : (h >= 9 && h <= 11) ? 140 : (h >= 7 && h <= 17) ? 50 : 25,
  };

  function rng(seed) {
    let s = Math.floor(seed) % 2147483647;
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
      chuveiro: 5.5 * (0.40 + r() * 0.16) * BANHO_FATOR[m] * (fds ? 1.15 : 1) * (pos ? 0.86 : 1),
      ar:       1.2 * AR_HORAS[m] * (0.6 + r() * 0.8) * (fds ? 1.3 : 1) * (pos ? 0.85 : 1),
      cozinha:  1.1 + r() * 0.25 + (m >= 8 && m <= 10 ? 0.15 : 0) + 0.1 + r() * 0.15,
      tomadas:  (1.5 + r() * 0.5) * (fds ? 1.2 : 1) * (pos ? 0.9 : 1) + ((fds || r() < 0.15) ? 0.5 + r() * 0.4 : 0),
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
      if (d.id === 'tomadas') { por[d.id] = Math.round(media * (0.85 + Math.random() * 0.3)); continue; }
      if (d.id === 'cozinha') {
        if (estado.geladeira === undefined || Math.random() < 0.12) estado.geladeira = Math.random() < 0.35;
        const microondas = media > 100 && Math.random() < 0.3 ? 1100 : 0;
        por[d.id] = Math.round((estado.geladeira ? 150 : 0) + microondas);
        continue;
      }
      const pLigado = Math.min(0.95, media / d.potencia_nominal_w);
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
      const fatura = kwh * (1 + 0.01 + r() * 0.025);
      return {
        mes,
        completo,
        com_sistema: comSistema,
        kwh_sensores: comSistema ? r2(kwh) : null,
        kwh_fatura: completo ? Math.round(fatura) : null,
      };
    });
  }

  // Média de consumo por hora do dia no último mês completo com o sistema.
  function perfilHorario() {
    const { dias, hoje } = base();
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mes = monthKey(ref);
    const doMes = dias.filter(d => d.data.startsWith(mes));
    const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, kwh: 0, por_dispositivo: {} }));
    for (const d of DISPOSITIVOS) {
      const mediaDia = sum(doMes.map(x => x.por[d.id])) / doMes.length;
      const perfilDia = sum(horas.map(h => PERFIL[d.id](h.hora))) / 1000;
      for (const h of horas) {
        const v = (PERFIL[d.id](h.hora) / 1000) * (mediaDia / perfilDia);
        h.por_dispositivo[d.id] = r3(v);
        h.kwh += v;
      }
    }
    horas.forEach(h => { h.kwh = r3(h.kwh); });
    return { mes, horas };
  }

  // Maiores picos de potência do mês atual.
  function picos() {
    const { dias, hoje } = base();
    const doMes = dias.filter(d => d.data.startsWith(monthKey(hoje)) && d.data !== dayKey(hoje));
    const r = rng(4242);
    const eventos = [];
    for (const d of doMes) {
      const at = (h, m) => new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), h, m).toISOString();
      eventos.push({ inicio: at(19 + Math.floor(r() * 2), Math.floor(r() * 60)), dispositivo_id: 'chuveiro', pico_w: Math.round(5380 + r() * 110), duracao_min: Math.round(9 + r() * 7) });
      eventos.push({ inicio: at(13 + Math.floor(r() * 3), Math.floor(r() * 60)), dispositivo_id: 'ar', pico_w: Math.round(1250 + r() * 140), duracao_min: Math.round(90 + r() * 120) });
      eventos.push({ inicio: at(12, Math.floor(r() * 30)), dispositivo_id: 'cozinha', pico_w: Math.round(1180 + r() * 80), duracao_min: Math.round(3 + r() * 5) });
    }
    const top = id => eventos.filter(e => e.dispositivo_id === id).sort((a, b) => b.pico_w - a.pico_w);
    return [...top('chuveiro').slice(0, 2), ...top('ar').slice(0, 1), ...top('cozinha').slice(0, 1)];
  }

  function calibracao() {
    return {
      ultima: '2026-09-28',
      sensores: [
        { canal: 'CT1', fator: null, referencia: 'Multímetro', erro_pct: 1.9 },
        { canal: 'CT2', fator: null, referencia: 'Multímetro', erro_pct: 2.4 },
        { canal: 'CT3', fator: null, referencia: 'Multímetro', erro_pct: 2.1 },
        { canal: 'CT4', fator: null, referencia: 'Multímetro', erro_pct: 3.0 },
      ],
    };
  }

  function esp32() {
    const r = rng(Date.now() / 60000);
    const esperados = 8640; // 1 pacote a cada 10 s
    return {
      id: 'ESP32-01',
      firmware: '0.1.0',
      online: true,
      ultima_leitura: new Date().toISOString(),
      ip: '192.168.0.42',
      rssi_dbm: Math.round(-62 + r() * 8),
      ligado_desde: new Date(Date.now() - (3 * 24 + 4) * 3600 * 1000).toISOString(),
      intervalo_envio_s: 10,
      protocolo: 'HTTPS (REST)',
      endpoint: '/api/leituras',
      pacotes_esperados_24h: esperados,
      pacotes_recebidos_24h: esperados - Math.round(20 + r() * 30),
    };
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
      variaveis: 'consumo diário, dia da semana',
      treino_desde: dayKey(DATA_ADOCAO),
      ultimo_treino: dayKey(hoje),
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

  return { dispositivos, tempoReal, ultimas24h, diario, mensal, perfilHorario, picos, calibracao, esp32, previsao };
})();
