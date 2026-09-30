# docs/

A documentação da entrega, em português, e o site que a reúne. Os `.md` são a **fonte**; o `index.html` é
**gerado** a partir deles e não deve ser editado à mão.

## O site

Publicado em [eu-adrianocarvalho.github.io/enter-challenge](https://eu-adrianocarvalho.github.io/enter-challenge/)
pelo GitHub Pages, a partir da raiz da branch `main`: o `index.html` da raiz redireciona para `docs/`, e o site
abre os arquivos de `Input/`, `Output/` e `src/` por caminhos relativos. Localmente, abra `docs/index.html` no
navegador. É uma página única, com a barra lateral por tópicos:

| Tópico | Seções (arquivo de origem) |
|---|---|
| 01 Apresentação | Visão geral (`01_visao_geral.md`) e A carta e o brief (a carta da v1 ao lado da v2, lida de `Output/`) |
| 02 O trabalho | Diagnóstico da v1 (`02`), Melhorias implementadas (`03`), Arquitetura e código (`04`), Dados externos (`05`), Qualidade e travas (`06`) |
| 03 Uso | Como usar (`07_como_usar.md`) |
| 04 Arquivos | Prévia e download de cada arquivo do projeto, montados pelo gerador |

Os números do topo (retorno, custo, alertas, testes) são lidos da última carta em `Output/` e do
`enter_challenge.rivet-project`, então mudam a cada execução.

O site usa o Mermaid e as fontes da internet. Sem conexão, o texto aparece, mas os diagramas não.

## Os arquivos

| Arquivo | O que tem |
|---|---|
| `01_visao_geral.md` | O desafio, o que foi entregue, a ideia central e os resultados do Albert |
| `02_diagnostico_v1.md` | Os problemas da primeira versão, com a prova de cada um |
| `03_melhorias_implementadas.md` | As três áreas pedidas: rentabilidade, compra e venda, formatação |
| `04_arquitetura_e_codigo.md` | O Main Graph, os subgrafos, os Code nodes e como o projeto é gerado |
| `05_dados_externos.md` | Por que e de onde vêm os dados da CVM, do Banco Central e do Yahoo |
| `06_qualidade_e_travas.md` | As travas contra erro do LLM, com as evidências reais, e os testes |
| `07_como_usar.md` | Instalar, rodar pelo app ou pelo terminal, trocar o logo, outro cliente ou mês |
| `index.html` | O site, gerado; não editar |
| `site/build.mjs` | Gera o `index.html`: escolhe as seções de cada tópico, a carta e o catálogo de arquivos |
| `site/layout.mjs` | O layout da página: barra lateral, tópicos, paginação, CSS e JS embutidos |
| `site/markdown.mjs` | Converte os `.md` em HTML e prepara os diagramas Mermaid |
| `site/style.css`, `site/app.js`, `site/mermaid.js` | Visual, navegação e desenho dos diagramas, embutidos no `index.html` |

## Como atualizar

Edite o `.md` e rode:

```powershell
npm run docs
```

Rode também depois de gerar uma carta nova (`npm run letter` ou Run no app), para o site mostrar a carta e os
números mais recentes. Os links entre os `.md` (por exemplo, `[Dados externos](05_dados_externos.md)`) viram
links para a seção correspondente do site.
