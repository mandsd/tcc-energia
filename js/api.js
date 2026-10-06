/*
 * Dados guardados no navegador e acesso à API.
 * Sem URL de API configurada, o site roda em modo demonstração (js/mock.js).
 */
function store(key, padrao) {
  const copia = () => JSON.parse(JSON.stringify(padrao));
  return {
    get() {
      try { return JSON.parse(localStorage.getItem(key)) ?? copia(); } catch { return copia(); }
    },
    set(v) {
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* armazenamento indisponível */ }
    },
    clear() {
      try { localStorage.removeItem(key); } catch { /* idem */ }
    },
  };
}

const BANDEIRAS = {
  verde:     { nome: 'Verde',                adicional: 0 },
  amarela:   { nome: 'Amarela',              adicional: 0.01885 },
  vermelha1: { nome: 'Vermelha – patamar 1', adicional: 0.04463 },
  vermelha2: { nome: 'Vermelha – patamar 2', adicional: 0.07877 },
};

const Settings = (() => {
  const s = store('energia.config', {});
  const PADRAO = { tarifa: 0.89, bandeira: 'verde', meta: 250, apiUrl: '' };
  return { get: () => ({ ...PADRAO, ...s.get() }), set: v => s.set(v), PADRAO };
})();

const Sessao = store('energia.sessao', null);         // { nome, email, token }
const Faturas = store('energia.faturas', {});         // { 'AAAA-MM': kWh } digitados pelo usuário
const Nomes = store('energia.nomes', {});             // { id_dispositivo: nome } renomeados
const SensoresNovos = store('energia.sensores', []);  // sensores cadastrados aguardando leituras
const Calibracoes = store('energia.calibracoes', {}); // { canal: { fator, erro_pct, data } }

const precoKwh = (s = Settings.get()) => s.tarifa + (BANDEIRAS[s.bandeira] || BANDEIRAS.verde).adicional;

const Api = (() => {
  const ROTAS = {
    dispositivos:  '/api/dispositivos',
    tempoReal:     '/api/leituras/tempo-real',
    ultimas24h:    '/api/leituras/24h',
    diario:        '/api/consumo/diario',
    mensal:        '/api/consumo/mensal',
    perfilHorario: '/api/consumo/perfil-horario',
    picos:         '/api/consumo/picos',
    calibracao:    '/api/sensores/calibracao',
    esp32:         '/api/esp32/status',
    previsao:      '/api/previsao/mes-atual',
    login:         '/api/auth/login',
    cadastro:      '/api/auth/cadastro',
  };
  const baseUrl = () => (Settings.get().apiUrl || '').trim().replace(/\/+$/, '');

  async function req(nome, opts = {}) {
    const token = Sessao.get()?.token;
    const res = await fetch(baseUrl() + ROTAS[nome], {
      ...opts,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) throw new Error(`Falha ao consultar ${ROTAS[nome]} (HTTP ${res.status})`);
    return res.json();
  }

  async function get(nome) {
    return baseUrl() ? req(nome) : Mock[nome]();
  }

  // login / cadastro: no modo demonstração qualquer e-mail entra.
  async function post(nome, corpo) {
    if (baseUrl()) return req(nome, { method: 'POST', body: JSON.stringify(corpo) });
    const prefixo = corpo.email.split('@')[0].replace(/[._-]+/g, ' ');
    return { nome: corpo.nome || prefixo.replace(/\b\w/g, c => c.toUpperCase()), email: corpo.email, token: null };
  }

  return { get, post, ROTAS, demo: () => !baseUrl() };
})();
