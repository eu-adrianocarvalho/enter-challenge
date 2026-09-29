# Como usar

## Instalação (uma vez)

Pré-requisitos:
- Python 3.11 ou mais novo;
- Node.js 18 ou mais novo;
- uma chave da OpenAI;
- Microsoft Word ou LibreOffice, para gerar o PDF.

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
npm install                               # instala o @ironclad/rivet-cli 1.25.0
Copy-Item .env.example .env               # e coloque a OPENAI_API_KEY no .env
```

## Gerar a carta

```powershell
.venv\Scripts\python src\run.py
```

Na primeira vez leva cerca de 1 minuto. Da segunda em diante, as respostas do LLM vêm de `data/llm/`, a execução leva segundos e não gasta nada. O brief é impresso no terminal.

| Opção | Para quê |
|---|---|
| `--refresh-llm` | Chama os grafos de novo, ignorando as respostas guardadas |
| `--refresh-market` | Baixa de novo as cotas da CVM e os benchmarks |
| `--no-pdf` | Gera só o DOCX, sem precisar de Word ou LibreOffice |

## O que sai em `Output/`

| Arquivo | Para quem |
|---|---|
| `carta_albert_2025-05-07.pdf` | O cliente |
| `carta_albert_2025-05-07.docx` | O assessor, se quiser ajustar algo antes de enviar |
| `brief_assessor_albert_2025-05-07.md` | O assessor: o que revisar e aprovar |
| `grafico_albert_2025-05-07.png` | O gráfico que vai na carta |
| `facts_albert_2025-05-07.json` | Auditoria: os FACTS e o texto final da carta |
| `run_log_albert_2025-05-07.json` | Auditoria: tokens, custo e tempo de cada chamada |

## O fluxo do assessor

1. Abrir o brief e ver o **status** no topo ("PRONTA PARA REVISÃO" ou "BLOQUEADA").
2. Resolver os alertas de severidade **alta**. No caso do Albert: confirmar a liquidação do CDB e checar o salto de +76% da HAPV3.
3. Conferir as sugestões, as citações do research que as sustentam e a nota de IR.
4. Enviar o PDF, ou ajustar o DOCX e exportar.

## Ver os grafos no app do Rivet

1. Abrir `rivet/xp_monthly_letter.rivet-project` no Rivet.
2. Colocar a chave da OpenAI em *Settings*.
3. Escolher um grafo, por exemplo `write_letter` ou `macro_outlook`, e rodar.

Os inputs já vêm preenchidos com os dados reais da última execução do Albert.

Para editar um prompt, mude o arquivo em `rivet/prompts/` e rode `.venv\Scripts\python src\build_rivet.py` para regenerar o projeto.

**Cuidado com o app do Rivet aberto:** o `.rivet-project` é gerado a partir de `rivet/prompts/` e `rivet/schemas/`. Se o app estiver com uma versão antiga aberta e você salvar, ele grava essa versão por cima. Isso já aconteceu durante o desenvolvimento: o arquivo voltou a ter 5 grafos, sem o `review_letter`. O `src/run.py` regenera o projeto antes de cada execução, então o pipeline nunca usa um grafo desatualizado. Mas, para ver a versão atual no app, feche e abra o arquivo de novo.

## Rodar os testes

```powershell
.venv\Scripts\python -m pytest
```

## Gerar a documentação e o relatório

```powershell
.venv\Scripts\python src\build_docs.py     # recria docs/index.html (o src\run.py já faz isso no final)
.venv\Scripts\python src\build_report.py   # recria docs/relatorio.pdf a partir de docs/relatorio.md
```

O `docs/relatorio.pdf` é o relatório curto que o desafio pede (até 2 páginas): problemas da v1, racional da solução e próximos passos. Para mudar o texto, edite `docs/relatorio.md` e rode o segundo comando; ele avisa se passar de 2 páginas.

## Trocar o logo da carta

O logo fica em `assets/xp/` e o caminho é definido em `config/settings.yaml` (`brand.logo`). Para trocar, basta colocar o arquivo novo na pasta, ajustar o caminho e rodar `src\run.py`, sem mexer no código. Se o arquivo não existir, a execução para com uma mensagem dizendo qual caminho corrigir.

Se o PDF estiver aberto num visualizador, feche e abra de novo, porque a maioria dos visualizadores não recarrega o arquivo sozinha.

## Outro cliente ou outro mês

1. Em `config/settings.yaml`, troque os caminhos dos arquivos de entrada e as datas `period.start` e `period.end`.
2. Rode com `--refresh-market`, para baixar as cotas e os benchmarks do novo período.

Hoje existem faixas apenas para o perfil **moderado**. Os outros perfis precisam do seu `config/allocation_*.yaml`, e fundos novos precisam entrar em `config/fund_registry.yaml`.
