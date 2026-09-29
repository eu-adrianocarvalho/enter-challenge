# data/

Dados que o fluxo lê e que foram guardados de execuções anteriores. Nada aqui é escrito pelo **Main Graph: Enter Challenge**; as saídas dele vão para `Output/`.

| Arquivo ou pasta | O que tem | De onde veio | Quem usa |
|---|---|---|---|
| `market/cvm_inf_diario_subset.csv` | Cotas diárias dos 7 fundos do Albert em abril e maio de 2025 | Informe diário da CVM (`dados.cvm.gov.br`, `inf_diario_fi_202504` e `_202505`), filtrado pelos CNPJs de `config/fund_registry.yaml`. Baixado pela versão Python da branch `main` | O node "Code: Market Data" calcula o retorno de cada fundo no período |
| `market/benchmarks_2025-04-07_2025-05-07.json` | CDI, IPCA 12 meses e Ibovespa do período | Banco Central (SGS, séries 12 e 433) e Yahoo Finance (`^BVSP`), buscados na mesma janela | O node "Code: Market Data" busca esses valores ao vivo e só usa o arquivo se a rede falhar |
| `rivet_inputs/` | As entradas de uma chamada real de cada grafo de LLM | Gravadas numa execução real para o Albert | `src/build.mjs` usa como valores padrão, para que cada grafo de LLM rode sozinho no app durante a demo |
| `evidence/` | Respostas reais do LLM que mostraram por que cada trava existe (ver abaixo) | Execuções reais durante o desenvolvimento | Material para a reunião: não entram no fluxo |

## evidence/

| Arquivo | O que mostra |
|---|---|
| `01_extracao_gpt-4.1-mini_subtotal_trocado.json` | O gpt-4.1-mini transcreveu o subtotal de ações como 60.131,79 (o extrato diz 60.311,79). A reconciliação barrou. |
| `02_extracao_gpt-4.1-mini_apos_correcao_ainda_errada.json` | Mesmo recebendo o aviso, o mini repetiu o erro e ainda trocou a posição do Ibiuna pelo valor líquido. Por isso a extração passou para o gpt-4.1. |
| `03_macro_citacoes_com_reticencias_descartadas.json` | O modelo "citou" o relatório com reticências ("SELIC … 15,50 … 2025"). A checagem de ancoragem descartou esses itens, e o prompt passou a proibir reticências. |
| `04_carta_ja_liquidados_e_plus_plus.json` | Uma versão da carta que transformou "após confirmarmos a liquidação" em "já liquidados" e escreveu "Riza Lotus Plus Plus". Levou a notas operacionais escritas pelo código, a nomes curtos e à checagem de palavra repetida. |
| `05_revisor_aponta_distorcao_da_selic.json` | O revisor de fidelidade apontando que "possibilidade de estabilização" distorce "a Selic pode parar de subir antes". A versão seguinte corrigiu. |
