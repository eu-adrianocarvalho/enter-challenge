# Como usar

## Instalação (uma vez)

Pré-requisitos:
- Node.js 22 ou mais novo (o `npm test` usa glob no `node --test`, disponível a partir do 21);
- uma chave da OpenAI;
- Microsoft Edge ou Google Chrome, para imprimir a carta em PDF;
- o app do Rivet 1.25 ou mais novo, para rodar pelo app.

```powershell
npm install                               # rivet-cli, pdf-parse e yaml (e marked e mammoth para o site)
Copy-Item .env.example .env               # e coloque a OPENAI_API_KEY no .env
```

## Gerar a carta pelo app do Rivet

1. Abra `enter_challenge.rivet-project` no Rivet e coloque a chave da OpenAI em *Settings*.
2. Troque o executor de **Browser** para **Node**. Os nodes de código leem arquivos, chamam o BCB e o Yahoo e usam o navegador para gerar o PDF, e só o executor Node permite isso.
3. Abra o **Main Graph: Enter Challenge** e aperte **Run**. Cada node acende quando roda; os loops mostram cada tentativa. Em 30 a 50 segundos, o PDF está em `Output/`.
4. Clique em qualquer node para ver o que ele recebeu e devolveu. As saídas do grafo são `status`, `pdf_path` e `brief`.

A entrada `repo_dir` vem preenchida com a pasta onde o projeto foi gerado. Se o repositório estiver em outra pasta, rode `npm run build` uma vez ou digite o caminho na entrada. Se a pasta estiver errada, o primeiro node para com um erro de arquivo não encontrado, em vez de seguir com dado vazio como a v1 fazia.

**Cuidado com o app aberto:** o `.rivet-project` é gerado por `npm run build`. Se o app estiver com uma versão antiga aberta e você salvar, ele grava essa versão por cima. Depois de um build, feche o projeto no app sem salvar e abra de novo.

## Gerar a carta pelo terminal

```powershell
npm run letter
```

Roda o mesmo **Main Graph: Enter Challenge** com o `rivet-cli`, lendo a chave do `.env`, e imprime `status`, `pdf_path` e `brief` em JSON. Se o Edge ou o Chrome estiverem fora do lugar padrão, defina `BROWSER_PATH` ou ajuste `pdf.browsers` no `config/settings.yaml`.

Cada execução chama a API: cerca de US$ 0,10 com gpt-4.1.

## O que sai em `Output/`

| Arquivo | Para quem |
|---|---|
| `carta_albert_2025-05-07.pdf` | O cliente |
| `carta_albert_2025-05-07.html` | A fonte da carta: é o que vira o PDF, e abre em qualquer navegador |
| `brief_assessor_albert_2025-05-07.md` | O assessor: o que revisar e aprovar |
| `facts_albert_2025-05-07.json` | Auditoria: os FACTS e o texto final da carta |
| `run_log_albert_2025-05-07.json` | Auditoria: tokens e custo de cada chamada ao LLM |

## O fluxo do assessor

1. Abrir o brief e ver o **status** no topo ("PRONTA PARA REVISÃO DO ASSESSOR" ou "BLOQUEADA").
2. Resolver os alertas de severidade **alta**. No caso do Albert: confirmar a liquidação do CDB e checar o salto de +76% da HAPV3.
3. Conferir as sugestões, as citações do research que as sustentam e a nota de IR.
4. Enviar o PDF.

Se a carta sair bloqueada, o motivo aparece na seção de checagens do brief. Como o LLM varia de uma execução para outra, rodar de novo costuma resolver apontamentos do revisor; um extrato que não reconcilia, não.

## Rodar um grafo de LLM sozinho

Cada um dos seis grafos de LLM (**Subgraph: Macro Outlook**, **Subgraph: Write Letter** e os outros) também roda sozinho no app: as entradas vêm preenchidas com dados reais do Albert (`data/rivet_inputs/`). Serve para mostrar um prompt e a resposta estruturada sem rodar o fluxo inteiro.

## Mudar um prompt ou o código de um node

Os prompts ficam em `src/prompts/`, os schemas em `src/schemas/` e o código dos nodes em `src/code/`. Depois de editar:

```powershell
npm test          # 8 testes, sem chave de API, cerca de 1 segundo
npm run build     # regenera enter_challenge.rivet-project
```

Editar o código dentro do app não adianta: o próximo build sobrescreve. Nos nodes de código, não marque *Allow require*: no app desktop isso quebra o node (ver [Arquitetura e código](04_arquitetura_e_codigo.md)).

## Gerar a documentação

```powershell
npm run docs      # recria docs/index.html a partir de docs/*.md e da última carta em Output/
```

O site usa o Mermaid e as fontes da internet; sem conexão, o texto aparece, mas os diagramas não.

## Trocar o logo da carta

O logo fica em `Input/xp_inc_logo.jpg`, e o caminho é definido em `config/settings.yaml` (`brand.logo`). Para trocar, coloque o arquivo novo (JPG ou PNG) em `Input/`, ajuste o caminho e gere a carta de novo, sem mexer no código.

Se o PDF estiver aberto num visualizador, feche e abra de novo, porque a maioria dos visualizadores não recarrega o arquivo sozinha.

## Outro cliente ou outro mês

1. Em `config/settings.yaml`, troque os caminhos dos arquivos de entrada e as datas `period.start` e `period.end`.
2. Para outro mês, atualize o recorte das cotas da CVM em `data/market/cvm_inf_diario_subset.csv` (ver [Dados externos](05_dados_externos.md)); os benchmarks são buscados ao vivo.

Hoje existem faixas apenas para o perfil **moderado**. Outro perfil precisa do seu `config/allocation_*.yaml` e de uma entrada no `bands` do `src/code/load_inputs.js`, que hoje carrega só o moderado. Fundos novos precisam entrar em `config/fund_registry.yaml`.
