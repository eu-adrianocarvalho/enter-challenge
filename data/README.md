# data/

Dados que o pipeline gera ou baixa e guarda para reutilizar. Tudo aqui pode ser apagado e recriado com
`python src/run.py --refresh-llm --refresh-market`. Isso gasta tokens e exige internet.

| Pasta | O que tem | Por que guardar |
|---|---|---|
| `llm/` | Resposta de cada chamada a um grafo do Rivet (resultado, modelo, tokens, custo). O nome do arquivo é um hash de prompt + schema + modelo + inputs. | Repetir a execução não gasta tokens e dá exatamente a mesma carta. Mudar um prompt gera um hash novo, então só aquele grafo roda de novo. |
| `market/` | Retorno dos fundos pelas cotas da CVM, benchmarks (CDI, IPCA, Ibovespa) do período e o recorte das cotas diárias da CVM usado no cálculo. | O pipeline roda offline e o número do período não muda entre execuções. O CSV da CVM é a prova de onde saiu cada retorno. |
| `rivet_inputs/` | Os inputs da última chamada real de cada grafo. | `src/build_rivet.py` usa esses valores como padrão dos grafos, para que eles rodem direto no app do Rivet durante a demo. |
| `evidence/` | Respostas reais do LLM que mostraram por que cada trava existe (ver abaixo). | Material para a reunião: não entram no pipeline. |

## evidence/

| Arquivo | O que mostra |
|---|---|
| `01_extracao_gpt-4.1-mini_subtotal_trocado.json` | O gpt-4.1-mini transcreveu o subtotal de ações como 60.131,79 (o extrato diz 60.311,79). A reconciliação barrou. |
| `02_extracao_gpt-4.1-mini_apos_correcao_ainda_errada.json` | Mesmo recebendo o aviso, o mini repetiu o erro e ainda trocou a posição do Ibiuna pelo valor líquido. Por isso a extração passou para o gpt-4.1. |
| `03_macro_citacoes_com_reticencias_descartadas.json` | O modelo "citou" o relatório com reticências ("SELIC … 15,50 … 2025"). A checagem de ancoragem descartou esses itens, e o prompt passou a proibir reticências. |
| `04_carta_ja_liquidados_e_plus_plus.json` | Uma versão da carta que transformou "após confirmarmos a liquidação" em "já liquidados" e escreveu "Riza Lotus Plus Plus". Levou a notas operacionais escritas pelo código, a nomes curtos e à checagem de palavra repetida. |
| `05_revisor_aponta_distorcao_da_selic.json` | O revisor de fidelidade apontando que "possibilidade de estabilização" distorce "a Selic pode parar de subir antes". A versão seguinte corrigiu. |
