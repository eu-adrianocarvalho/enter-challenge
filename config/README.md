# config/

Parâmetros da execução e regras de negócio da carta, separados do código. O código diz **como** calcular; estes
arquivos dizem **com quais números e regras**. Ninguém gera esses arquivos: eles são editados à mão.

Quem lê os quatro arquivos é o primeiro node do grafo, **Code: Load Inputs**, a cada execução, e repassa tudo aos
outros nodes. Por isso uma mudança aqui vale na próxima execução, sem `npm run build`.

| Arquivo | O que decide | Exemplo com o Albert |
|---|---|---|
| `settings.yaml` | Qual carta gerar e como: arquivos do cliente, período, logo, modelos, custos, limites da carta e dos alertas | O período 07/04 a 07/05/2025 e o limite de 5% de caixa, que gera o alerta "29,8% do patrimônio parado" |
| `allocation_moderate.yaml` | As faixas de alocação do perfil moderado | Renda fixa em 43,7% (faixa 50% a 70%) e caixa em 29,8% (máximo 5%) viram R$ 40 mil em Tesouro Selic, R$ 40 mil em Tesouro IPCA+ e R$ 27 mil em multimercado |
| `research_shelf.yaml` | O que o motor pode recomendar: produtos e a lista de ações | HAPV3 e MRFG3 estão fora do perfil e viram venda; ITUB4 e B3SA3 estão na lista de compra |
| `fund_registry.yaml` | O cadastro dos fundos do extrato | O CNPJ de cada fundo é o que acha a cota dele nos dados da CVM |

`allocation_moderate.yaml` e `research_shelf.yaml` são **ilustrativos**, e dizem isso no próprio arquivo. Em
produção, viriam da carteira recomendada oficial do XP Research.

## settings.yaml

| Chave | Para que serve |
|---|---|
| `client.id` | Nome do cliente nos arquivos de saída (`carta_albert_…`) |
| `client.portfolio_pdf`, `client.risk_profile_txt` | Extrato e perfil de risco do cliente, em `Input/` |
| `research.macro_pdf` | Relatório macro da XP usado no cenário e nas justificativas |
| `research.prices_csv` | Preços atual e do mês anterior das ações |
| `brand.logo` | Logo no cabeçalho da carta (JPG ou PNG) |
| `period.start`, `period.end` | Janela do retorno do período: ações, fundos, CDI e Ibovespa usam as mesmas datas |
| `paths.output_dir`, `paths.data_dir` | Onde a carta é gravada (`Output/`) e onde ficam os dados salvos (`data/`) |
| `pdf.browsers` | Navegadores tentados, em ordem, para imprimir a carta em PDF (a variável `BROWSER_PATH` vem antes) |
| `rivet.project` | Arquivo que o `npm run build` grava: `enter_challenge.rivet-project` |
| `models.extraction`, `models.writing` | Modelo da OpenAI na leitura dos documentos e na escrita |
| `pricing_usd_per_million_tokens` | Preço de cada modelo, para o custo por chamada que aparece no brief |
| `letter.word_budget` | Limite de palavras da carta |
| `letter.max_pages` | Máximo de páginas do PDF; acima disso a carta sai bloqueada |
| `thresholds.idle_cash_pct` | Caixa e renda fixa vencida acima deste % do patrimônio geram alerta |
| `thresholds.single_stock_pct` | Uma ação acima deste % do patrimônio gera alerta de concentração |
| `thresholds.large_monthly_move_pct` | Variação no período acima deste % pede verificação de evento corporativo |
| `thresholds.stale_quote_days` | Cotas do extrato mais velhas que isso geram alerta |
| `thresholds.research_age_days` | Relatório macro mais velho que isso gera alerta |
| `thresholds.reconciliation_brl`, `reconciliation_pct` | Hoje não são lidas: a tolerância da reconciliação está fixa em `src/code/reconcile.js` |

## allocation_moderate.yaml

| Campo | Para que serve |
|---|---|
| `buckets` | Para cada classe (renda fixa, multimercado, renda variável, caixa), o mínimo, o alvo e o máximo em % do patrimônio |
| `surplus_bucket` | Classe que recebe o caixa que sobra depois de levar as outras ao alvo |
| `fixed_income_split` | Como o valor de renda fixa se divide entre pós-fixado e inflação |
| `rounding_brl` | Os valores sugeridos são arredondados para baixo neste múltiplo (R$ 1.000) |
| `profile`, `source` | Informativos: não são lidos pelo código |

A regra: o caixa acima do alvo de caixa é distribuído entre as classes abaixo do alvo, na proporção do que falta a
cada uma, e o que sobrar vai para `surplus_bucket`.

## research_shelf.yaml

| Campo | Para que serve |
|---|---|
| `products` | Produto sugerido para cada tipo de aplicação (pós-fixado, inflação, multimercado), com a classe e a tese que aparece na carta |
| `stocks.<ticker>.profile_fit` | `false` torna a ação candidata à venda |
| `stocks.<ticker>.buy_list` | `true` torna a ação candidata à compra, com o valor das vendas |
| `stocks.<ticker>.renamed_to` | Ticker novo; gera o alerta de ticker renomeado (ARZZ3 → AZZA3) |
| `stocks.<ticker>.dividend_payer` e `source` (no topo) | Informativos: não são lidos pelo código |

O LLM (**Subgraph: Advise**) só escolhe entre os candidatos que saem destas regras; ele não pode inventar um ativo.

## fund_registry.yaml

Uma entrada por fundo do extrato. O mapa foi conferido à mão, porque os nomes do extrato não batem com o cadastro
da CVM (ver `docs/05_dados_externos.md`).

| Campo | Para que serve |
|---|---|
| `statement_name` | Nome exatamente como aparece no extrato: é a chave que liga o fundo às outras informações |
| `display_name` | Nome curto que a carta usa |
| `cnpj` | Usado para achar as cotas do fundo em `data/market/cvm_inf_diario_subset.csv` |
| `bucket` | Classe do fundo na conta de alocação contra o perfil |
| `credit_private` | `true` soma o fundo no alerta de crédito privado sem rating conferido |
| `registry_note` | Mudança de cadastro que vira alerta (o Brave, que virou FIDC) |
| `monthly_estimate` | Retorno estimado para fundo sem cota diária, com o método, que o brief mostra |
| `cvm_name`, `strategy` | Informativos: registram o nome oficial e a estratégia, mas não são lidos pelo código |

## Mudanças comuns

- **Outro cliente ou outro mês:** troque os arquivos em `client` e `research` e as datas em `period`. Para outro
  mês, o recorte das cotas da CVM em `data/market/` também precisa ser atualizado.
- **Outro perfil:** crie `allocation_<perfil>.yaml` e acrescente o perfil no `bands` de `src/code/load_inputs.js`,
  que hoje carrega só o moderado.
- **Fundo novo no extrato:** acrescente uma entrada em `fund_registry.yaml` com o CNPJ conferido.
- **Recomendar outro produto ou ação:** edite `research_shelf.yaml`.
