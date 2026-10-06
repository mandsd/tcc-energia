# Consumo Energético Residencial

Site do TCC **Sistema Inteligente de Monitoramento do Consumo Energético Residencial** (IESB, 2026).

HTML, CSS e JavaScript puros: não precisa de instalação nem de build.

## Como abrir

Dê dois cliques em `index.html`. Ou, para servir localmente:

```
python -m http.server 8000
```

e acesse http://localhost:8000.

O nome do sistema fica em `NOME_SISTEMA`, no início de `js/app.js`.

## Telas

| Tela | O que mostra |
|---|---|
| Entrar | login e cadastro da residência com o código do ESP32 |
| Visão mensal | resumo do mês em uma frase (conta prevista × meta), onde a energia foi gasta, últimos meses |
| Histórico | consumo por mês, dia ou hora; antes × depois do sistema; sistema × conta de luz; horário de pico; tabela com todos os meses em CSV |
| Equipamentos | gasto de cada circuito no mês, se está ligado agora, momentos de maior consumo |
| Previsão de custo | faixa provável da conta, consumo acumulado × previsão × meta, simulação de economia, como a previsão é calculada |
| Dispositivo ESP32 | status, sinal Wi-Fi, leituras chegando ao vivo, calibração dos sensores, configuração técnica |
| Configurações | nome, tarifa, bandeira, meta de gasto, endereço da API |

## Dados

Sem endereço de API configurado, o site usa **dados simulados** (`js/mock.js`), aceita qualquer e-mail no login e mostra a nota "Valores ilustrativos para o protótipo".
Ao preencher o endereço da API em *Configurações*, ele passa a consultar os endpoints abaixo.
O backend precisa liberar CORS para a origem do site. Depois do login, as requisições levam `Authorization: Bearer <token>`.

| Método e rota | Resposta |
|---|---|
| `POST /api/auth/login` `{ email, senha }` | `{ nome, email, token }` |
| `POST /api/auth/cadastro` `{ nome, email, senha, codigo }` | `{ nome, email, token }` |
| `GET /api/dispositivos` | `[{ id, nome, canal, gpio, potencia_nominal_w, descricao?, online, ultima_leitura }]` |
| `GET /api/leituras/tempo-real` | `{ timestamp, potencia_total_w, por_dispositivo: { <id>: watts } }` |
| `GET /api/leituras/24h` | `[{ timestamp, potencia_w }]`: 96 pontos, um a cada 15 min |
| `GET /api/consumo/diario` | `[{ data: "AAAA-MM-DD", total_kwh, por_dispositivo: { <id>: kwh } }]`, do mais antigo até hoje (parcial) |
| `GET /api/consumo/mensal` | `[{ mes: "AAAA-MM", completo, com_sistema, kwh_sensores, kwh_fatura }]` |
| `GET /api/consumo/perfil-horario` | `{ mes, horas: [{ hora, kwh, por_dispositivo: { <id>: kwh } }] }` |
| `GET /api/consumo/picos` | `[{ inicio, dispositivo_id, pico_w, duracao_min }]` |
| `GET /api/sensores/calibracao` | `{ ultima, sensores: [{ canal, fator, referencia, erro_pct }] }` |
| `GET /api/esp32/status` | `{ id, firmware, online, ultima_leitura, ip, rssi_dbm, ligado_desde, intervalo_envio_s, protocolo, endpoint, pacotes_esperados_24h, pacotes_recebidos_24h }` |
| `GET /api/previsao/mes-atual` | `{ mes, modelo, variaveis, treino_desde, ultimo_treino, dias_no_mes, kwh_previsto, kwh_min, kwh_max, mae_kwh, mape, real: [{ dia, kwh_acumulado }], previsto: [{ dia, kwh_acumulado, min, max }] }` |

O formato exato de cada resposta está em `js/mock.js`: cada função ali devolve o mesmo JSON que a API real deve devolver.

Faturas lançadas, nomes de circuitos, sensores adicionados e calibrações registradas ficam salvos no navegador (`localStorage`) até existirem os endpoints de gravação correspondentes.

## Estrutura

```
index.html       layout e navegação
css/style.css    visual
js/mock.js       dados simulados + modelo de previsão de referência
js/api.js        dados salvos no navegador e acesso à API / mock
js/charts.js     gráficos SVG com tooltip
js/app.js        telas e roteamento
```
