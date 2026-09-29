# Visão geral

**Autor:** Adriano da Silva de Carvalho · **Repositório:** [github.com/eu-adrianocarvalho/enter-challenge](https://github.com/eu-adrianocarvalho/enter-challenge)

## O desafio

A XP quer que seus assessores atendam três vezes mais clientes *middle market* (menos de R$ 1 milhão na XP) sem perder qualidade. A ideia é uma carta mensal gerada por IA que explique a cada cliente:

1. como a carteira foi no mês;
2. como o cenário de mercado pode afetá-la;
3. o que ajustar, respeitando o perfil de risco e as recomendações do research.

Já existia uma primeira versão, um grafo no Rivet e uma carta de exemplo. A tarefa era revisar essa versão, achar os problemas, escolher pelo menos uma das três áreas de melhoria sugeridas e documentar o raciocínio.

As restrições do enunciado:
- carta de no máximo duas páginas, em formato de carta e em português;
- prompts, código e grafo do Rivet em inglês;
- entregar tudo o que for preciso para rodar.

## O que foi entregue

| Entregável | Onde |
|---|---|
| Workflow revisado: um grafo principal no Rivet (**Main Graph: Enter Challenge**) que roda tudo, com 6 grafos de LLM, 2 loops de correção e 10 nodes de código | `enter_challenge.rivet-project` |
| O código dos nodes, em arquivos revisáveis, e o gerador do projeto | `src/code/`, `src/build.mjs` |
| Nova carta para o Albert (PDF de 2 páginas, gerado a partir de um HTML com a identidade da XP) | `Output/carta_albert_2025-05-07.pdf` |
| Brief do assessor, o documento de revisão que acompanha a carta | `Output/brief_assessor_albert_2025-05-07.md` |
| Documentação completa e este site | `docs/*.md`, `docs/index.html` |
| Testes automatizados (8), que rodam sem chave de API | `src/tests/` |

A branch `main` do repositório guarda a mesma solução numa versão anterior, com os cálculos em Python e o Rivet só nas etapas de LLM. Esta versão leva tudo para dentro do Rivet: dá para abrir o grafo no app, apertar Run e ver cada etapa acontecendo até o PDF sair.

## A ideia central

**O LLM lê e escreve; o código calcula; nada chega ao cliente sem checagem.**

A v1 deixava o modelo inventar os números: o retorno, a diferença para o benchmark e as projeções macro. Na v2 nenhum número que o cliente vê é produzido por um LLM:

- **números:** vêm dos dados e são calculados em nodes de código do Rivet (JavaScript), já formatados em pt-BR;
- **LLM:** faz o que ele faz bem, ou seja, ler documentos bagunçados (o extrato em PDF, o relatório macro de 11 páginas) e escrever um texto claro;
- **checagens:** entre uma etapa e outra, travas automáticas conferem o trabalho do LLM e, quando falham, devolvem o erro ao modelo para corrigir;
- **assessor:** um brief mostra a ele tudo o que merece atenção antes do envio.

## Resultado em números (Albert, período de 07/04/2025 a 07/05/2025)

| Indicador | Valor |
|---|---|
| Retorno do período, ações e fundos (87% do investido) | **+2,51% (+R$ 6.650,04)** |
| CDI no mesmo período / Ibovespa | +1,00% / +6,22% |
| Caixa parado identificado (saldo + CDB vencido) | R$ 115.151,37 (29,8% do patrimônio) |
| Sugestões | R$ 107 mil em Tesouro Selic, Tesouro IPCA+ e multimercado; troca de HAPV3 e MRFG3 por ITUB4 e B3SA3 |
| Alertas de dados para o assessor | 11 |
| Checagens da carta | reconciliação 28/28, citações do macro conferidas no relatório, todo número da carta conferido nos FACTS, revisor sem apontamento grave |
| Tempo e custo | 30 a 50 segundos e cerca de US$ 0,10 por execução completa com gpt-4.1 |

Os valores exatos de cada execução (quantas citações foram mantidas, quantos números foram conferidos, quantas versões da carta foram escritas) ficam no brief, porque variam um pouco de uma execução para outra.

## Como ler esta documentação

1. [Diagnóstico da v1](02_diagnostico_v1.md): o que estava errado e a prova de cada problema.
2. [Melhorias implementadas](03_melhorias_implementadas.md): as três áreas sugeridas, o que foi feito e como.
3. [Arquitetura e código](04_arquitetura_e_codigo.md): o **Main Graph: Enter Challenge**, por que tudo no Rivet e como o código dos nodes é organizado e testado.
4. [Dados externos](05_dados_externos.md): por que buscar dados na CVM, no Banco Central e no Yahoo.
5. [Qualidade e travas](06_qualidade_e_travas.md): como o sistema evita erros, com evidências reais.
6. [Como usar](07_como_usar.md): instalar, rodar no app do Rivet ou no terminal e adaptar para outro cliente.
