# data/

Dados que o fluxo lê, baixa ou guarda para reutilizar.

| Pasta | O que tem | Por que guardar |
|---|---|---|
| `llm/` | Cache de respostas do LLM da versão Python (branch `main`). O grafo `monthly_letter` não usa. | Só a versão Python lê essa pasta. |
| `market/` | Recorte das cotas diárias da CVM usado no retorno dos fundos, e os benchmarks (CDI, IPCA, Ibovespa) do período. | O node "Dados de mercado" calcula os fundos a partir desse CSV e usa o arquivo de benchmarks quando não consegue buscar ao vivo no BCB e no Yahoo. |
| `rivet_inputs/` | Os inputs de uma chamada real de cada grafo de LLM. | `rivet/build.mjs` usa esses valores como padrão dos grafos, para que cada um rode sozinho no app do Rivet durante a demo. |
| `evidence/` | Respostas reais do LLM que mostraram por que cada trava existe (ver abaixo). | Material para a reunião: não entram no pipeline. |

## evidence/

| Arquivo | O que mostra |
|---|---|
| `01_extracao_gpt-4.1-mini_subtotal_trocado.json` | O gpt-4.1-mini transcreveu o subtotal de ações como 60.131,79 (o extrato diz 60.311,79). A reconciliação barrou. |
| `02_extracao_gpt-4.1-mini_apos_correcao_ainda_errada.json` | Mesmo recebendo o aviso, o mini repetiu o erro e ainda trocou a posição do Ibiuna pelo valor líquido. Por isso a extração passou para o gpt-4.1. |
| `03_macro_citacoes_com_reticencias_descartadas.json` | O modelo "citou" o relatório com reticências ("SELIC … 15,50 … 2025"). A checagem de ancoragem descartou esses itens, e o prompt passou a proibir reticências. |
| `04_carta_ja_liquidados_e_plus_plus.json` | Uma versão da carta que transformou "após confirmarmos a liquidação" em "já liquidados" e escreveu "Riza Lotus Plus Plus". Levou a notas operacionais escritas pelo código, a nomes curtos e à checagem de palavra repetida. |
| `05_revisor_aponta_distorcao_da_selic.json` | O revisor de fidelidade apontando que "possibilidade de estabilização" distorce "a Selic pode parar de subir antes". A versão seguinte corrigiu. |
