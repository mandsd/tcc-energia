/*
 * Configurações do usuário e acesso aos dados.
 * Sem URL de API configurada, o site roda em modo demonstração (js/mock.js).
 */
const BANDEIRAS = {
  verde:     { nome: 'Verde',                adicional: 0 },
  amarela:   { nome: 'Amarela',              adicional: 0.01885 },
  vermelha1: { nome: 'Vermelha – patamar 1', adicional: 0.04463 },
  vermelha2: { nome: 'Vermelha – patamar 2', adicional: 0.07877 },
};

const Settings = (() => {
  const KEY = 'energia.config';
  const PADRAO = { tarifa: 0.85, bandeira: 'verde', meta: 250, apiUrl: '' };
  function get() {
    try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...PADRAO }; }
  }
  function set(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* armazenamento indisponível */ }
  }
  return { get, set, PADRAO };
})();

// Valores de fatura digitados pelo usuário (kWh por mês), sobrepõem os da API.
const Faturas = (() => {
  const KEY = 'energia.faturas';
  function all() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }
  function set(mes, kwh) {
    const f = all();
    if (kwh == null || isNaN(kwh)) delete f[mes]; else f[mes] = kwh;
    try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* idem */ }
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch { /* idem */ }
  }
  return { all, set, clear };
})();

const precoKwh = (s = Settings.get()) => s.tarifa + (BANDEIRAS[s.bandeira] || BANDEIRAS.verde).adicional;

const Api = (() => {
  const ROTAS = {
    dispositivos: '/api/dispositivos',
    tempoReal:    '/api/leituras/tempo-real',
    ultimas24h:   '/api/leituras/24h',
    diario:       '/api/consumo/diario',
    mensal:       '/api/consumo/mensal',
    previsao:     '/api/previsao/mes-atual',
  };
  const baseUrl = () => (Settings.get().apiUrl || '').trim().replace(/\/+$/, '');

  async function get(nome) {
    const b = baseUrl();
    if (!b) return Mock[nome]();
    const res = await fetch(b + ROTAS[nome], { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Falha ao consultar ${ROTAS[nome]} (HTTP ${res.status})`);
    return res.json();
  }

  return { get, ROTAS, demo: () => !baseUrl() };
})();
