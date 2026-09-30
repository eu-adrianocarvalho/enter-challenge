# src/

Tudo o que forma o projeto do Rivet, `enter_challenge.rivet-project`, na raiz do repositório. O projeto não é
editado no app: ele é **gerado** a partir destes arquivos pelo `npm run build`. Assim o código, os prompts e os
schemas ficam em arquivos que dá para revisar, versionar e testar.

| Caminho | O que tem |
|---|---|
| `build.mjs` | Gera o `enter_challenge.rivet-project`. Monta os 6 subgrafos de LLM a partir de `prompts/` e `schemas/`, os dois corpos de loop, o **Main Graph: Enter Challenge** e os Code nodes a partir de `code/`. Define os nomes dos grafos na lateral e os títulos dos nodes. Mantém os grafos que não gera, como o **V1 Graph: Original Challenge (unchanged)** |
| `code/nodes.mjs` | Catálogo dos Code nodes: título, bibliotecas, portas de entrada e saída, permissões do executor. A função `assembleCode()` monta o texto que vai dentro de cada node |
| `code/*.js` | O corpo de cada um dos 10 Code nodes |
| `code/lib/*.js` | As 14 bibliotecas compartilhadas, coladas antes do corpo de cada node que as usa |
| `prompts/<grafo>.system.md`, `<grafo>.user.md` | Os prompts de cada subgrafo de LLM, em inglês. `{{facts_json}}`, `{{word_budget}}` e afins são preenchidos pelas entradas do grafo |
| `schemas/<grafo>.json` | O JSON schema estrito que a resposta de cada subgrafo de LLM precisa seguir |
| `tests/` | Testes que rodam o código dos nodes sem chamar o LLM (abaixo) |

## Os Code nodes

| Título no app | Arquivo |
|---|---|
| Code: Load Inputs | `code/load_inputs.js` |
| Code: Market Data (CVM, BCB, Yahoo) | `code/market_data.js` |
| Code: Reconcile Statement | `code/reconcile.js` |
| Code: Check Macro Quotes | `code/ground_macro.js` |
| Code: Analyze Portfolio | `code/analyze.js` |
| Code: Build FACTS | `code/build_facts.js` |
| Code: Fact-check Figures | `code/check_numbers.js` |
| Code: Decide Letter Version | `code/decide_letter.js` |
| Code: Render Letter (HTML) | `code/render_letter.js` |
| Code: Publish (PDF, Brief, Log) | `code/publish.js` |

O que cada um faz e quais bibliotecas usa está em `docs/04_arquitetura_e_codigo.md` e no cabeçalho de cada arquivo.

## Como mexer

1. Edite o arquivo: prompt, schema, corpo de node ou biblioteca.
2. `npm test`, para conferir que os números não mudaram sem querer.
3. `npm run build`, para regravar o `enter_challenge.rivet-project`.
4. Se o projeto estiver aberto no app do Rivet, feche sem salvar e abra de novo. Salvar a versão antiga grava por
   cima do arquivo novo; se acontecer, rode `npm run build` outra vez.

## Regras do código dos nodes

O Rivet executa o texto de um Code node como o corpo de uma função assíncrona. Por isso:

- **O arquivo não tem `import` nem `export`.** As bibliotecas são funções soltas que o `build.mjs` cola antes do
  corpo. Um node pode usar `await` direto e termina com `return`.
- **Entradas e saídas passam por `lib/io.js`:** `input(inputs, 'nome')` lê uma porta, e `typed({ ... })` empacota as
  saídas no formato do Rivet.
- **Nunca declare `context` nem `graphInputs`:** o Rivet já usa esses nomes, e o node quebra. A configuração se
  chama `setup`.
- **Nunca marque *Allow require*:** no executor Node do app desktop isso quebra o node. Para ler arquivos ou usar
  pacotes, use `projectRequire()` de `lib/modules.js`.
- **O código editado dentro do app se perde** no próximo build. Edite sempre aqui.
- **As posições dos nodes também vêm do `build.mjs`.** Se reorganizar um grafo no app e salvar, copie as novas
  posições (o `visualData` de cada node no `.rivet-project`) para as chamadas do `build.mjs`, ou o próximo build
  desfaz o layout.

Os ids dos grafos (`graph_monthly_letter`, `graph_advise`…) são fixos, porque as ligações entre os grafos usam
esses ids. Os nomes que aparecem na lateral podem mudar à vontade em `build.mjs`.

## Testes

`npm test` roda os 8 testes em cerca de 1 segundo, sem chave de API e sem internet.

| Arquivo | O que é |
|---|---|
| `tests/pipeline.test.mjs` | Os testes: leitura do PDF, reconciliação, rentabilidade, candidatos e IR, citações do macro, FACTS, fact-check e HTML da carta |
| `tests/harness.mjs` | Executa o código de um node do mesmo jeito que o executor Node do Rivet, com os mesmos parâmetros e sem `require` |
| `tests/fixtures/albert_statement.json` | O extrato do Albert transcrito à mão: o gabarito da extração |
| `tests/fixtures/llm_*.json` | Respostas reais do LLM (perfil, macro e advise), para testar sem chamar a API |
| `tests/fixtures/python_facts_and_letter.json` | Os FACTS e a carta da versão Python (branch `main`), para garantir que os números são os mesmos |
