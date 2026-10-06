# Monitor de Energia Residencial

Site do TCC **Sistema Inteligente de Monitoramento do Consumo Energético Residencial** (IESB, 2026).

HTML, CSS e JavaScript puros: não precisa de instalação nem de build.

## Como abrir

Dê dois cliques em `index.html`. Ou, para servir localmente:

```
python -m http.server 8000
```

e acesse http://localhost:8000.

## Telas

| Tela | O que mostra | Objetivo do plano |
|---|---|---|
| Painel | potência ao vivo, consumo e gasto do mês, previsão da conta, meta, ranking de equipamentos, últimas 24 h | 5 |
| Histórico mensal | consumo mês a mês (fatura antes do sistema, sensores depois), tabela | 3, 5 |
| Equipamentos | um cartão por sensor CT, com potência ao vivo e consumo diário | 1, 2 |
| Previsão | consumo acumulado real × previsto, faixa de incerteza, MAE, padrão semanal | 4 |
| Antes × depois | mesmo mês do ano anterior × com o sistema; sensores × conta de luz | 6, 7 |
| Configurações | tarifa, bandeira, meta de gasto, URL da API | — |

## Dados

Sem URL de API configurada, o site usa **dados simulados** (`js/mock.js`) e mostra o aviso "Modo demonstração".
Ao preencher o endereço da API em *Configurações*, ele passa a consultar os endpoints abaixo (GET, JSON).
O backend precisa liberar CORS para a origem do site.

| Endpoint | Resposta |
|---|---|
| `/api/dispositivos` | `[{ id, nome, canal, potencia_nominal_w, online, ultima_leitura }]` |
| `/api/leituras/tempo-real` | `{ timestamp, potencia_total_w, por_dispositivo: { <id>: watts } }` |
| `/api/leituras/24h` | `[{ timestamp, potencia_w }]`: 96 pontos, um a cada 15 min |
| `/api/consumo/diario` | `[{ data: "AAAA-MM-DD", total_kwh, por_dispositivo: { <id>: kwh } }]`, do mais antigo ao mais recente, terminando em hoje (parcial) |
| `/api/consumo/mensal` | `[{ mes: "AAAA-MM", completo, com_sistema, kwh_sensores, kwh_fatura }]` |
| `/api/previsao/mes-atual` | `{ mes, modelo, dias_no_mes, kwh_previsto, kwh_min, kwh_max, mae_kwh, mape, real: [{ dia, kwh_acumulado }], previsto: [{ dia, kwh_acumulado, min, max }] }` |

O formato exato de cada resposta está em `js/mock.js`: cada função ali devolve o mesmo JSON que a API real deve devolver.

## Estrutura

```
index.html       layout e navegação
css/style.css    visual (cores do modelo IESB)
js/mock.js       dados simulados + modelo de previsão de referência
js/api.js        configurações e acesso à API / mock
js/charts.js     gráficos SVG com tooltip
js/app.js        telas e roteamento
```
