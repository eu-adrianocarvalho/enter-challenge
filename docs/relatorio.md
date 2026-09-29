# Carta mensal XP com IA: revisão da v1 e proposta da v2

**Autor:** Adriano da Silva de Carvalho · **Repositório:** [github.com/eu-adrianocarvalho/enter-challenge](https://github.com/eu-adrianocarvalho/enter-challenge)

## 1. Problemas da primeira versão

**O grafo tinha bugs que mudavam o conteúdo da carta.**

- **Entradas trocadas:** as três saídas intermediárias chegavam ao prompt final nos campos errados. O resumo da carteira entrava como "perfil de risco", o perfil como "macro" e o macro como "carteira".
- **Nome errado:** o prompt tinha "Prezado João" fixo, mas o cliente é Albert.
- **Arquivo ausente virava prompt vazio:** os arquivos eram lidos de caminhos absolutos de outra máquina, com `errorOnMissingFile: false`. Um arquivo inexistente virava um prompt vazio, sem erro.
- **Carta colada à mão:** o grafo não tinha saída, e a carta foi colada manualmente no Word.

**A carta afirmava coisas falsas.**

- **Números inventados:** "retorno de 3,5%, 0,2 p.p. abaixo do benchmark" e "fundos com 17,4%" não aparecem em nenhum input. O exemplo do prompt ("1.2% in May… +0.4 pp") ensinava o formato, e o modelo preencheu com números.
- **Macro contrário ao relatório:** a carta dizia Fed cortando juros em julho, Selic de 9%, IPCA de 4,0% e dólar a 4,70. O relatório da XP diz Fed sem cortes em 2025, Selic terminal de 15,50%, IPCA de 6,1% e dólar a 6,20.
- **Rentabilidade desde a compra apresentada como do mês:** a carta dizia que HAPV3 caiu, mas no mês ela subiu 76%. Quem caiu foi MRFG3 (−16%).
- **Ação que não aconteceu:** "optamos por não realizar realocações" foi copiado do exemplo do prompt.
- **Recomendação genérica:** "continuar diversificando", sem citar ativo nem research, e sem notar que a carteira não bate com o perfil.

**Ninguém olhou os dados.**

- **CDB vencido e caixa parado:** o CDB C6 venceu em 05/09/2024, oito meses antes do extrato. Somado ao saldo em conta, cerca de 30% do patrimônio (R$ 115 mil) está sem render, com a Selic indo para 15,5%.
- **Informações desatualizadas no extrato:** as cotas dos fundos são de abril de 2024, o ticker ARZZ3 virou AZZA3 e o "Brave I FIC FIM CP" virou FIDC em novembro de 2024.
- **Carteira desalinhada ao perfil moderado:** há ações sem histórico de dividendos (HAPV3 −74,6% desde a compra) e 44% do patrimônio em crédito privado, sem checagem do rating mínimo BB+ que o perfil exige.
- **Planilha de rentabilidade inacabada:** valores corrompidos pelo formato regional (22.9 virou 22/set) e fórmula só nas ações, sem ponderação nem benchmark.

**A arquitetura não escalava.**

- **Macro refeito por cliente:** o macro era resumido de novo para cada cliente, com custo repetido e uma leitura diferente do mesmo relatório para cada um.
- **Números passando por LLMs:** os números atravessavam dois LLMs em texto livre.
- **Nenhum teste.**

## 2. Racional da abordagem

**Princípio: o LLM lê e escreve, o código calcula, e nada chega ao cliente sem checagem.** Num produto que vai para dezenas de milhares de clientes, um número errado custa muito mais que um parágrafo menos elegante. Por isso cada tarefa ficou com quem erra menos nela.

- **LLM onde há texto não estruturado:** leitura do extrato e do perfil; síntese do relatório macro, uma vez por mês e reutilizada para todos os clientes; escolha e explicação das recomendações; redação e revisão da carta. São seis grafos no Rivet, todos com saída JSON validada por schema.
- **Código onde há conta ou regra:** rentabilidade do período por ativo e por classe, com cotas diárias reais da CVM para os fundos; CDI, IPCA e Ibovespa da mesma janela; bandas de alocação do perfil; dimensionamento das movimentações; estimativa de IR.
- **Checagens entre as etapas:** o extrato extraído precisa fechar com os subtotais; cada afirmação do macro precisa de uma citação literal encontrada no relatório; a carta só pode usar números do bloco FACTS, conferidos por regex, e passa por um revisor de fidelidade. Os apontamentos voltam ao redator em até três versões.
- **Assessor no loop:** junto com a carta sai um brief com os alertas de dados, a evidência de cada sugestão e o custo. O assessor revisa em minutos em vez de escrever do zero, e é isso que permite atender três vezes mais clientes sem perder qualidade nem conformidade.

Das três áreas sugeridas, fiz as três, com a rentabilidade no centro:

- **Rentabilidade:** cálculo exato das ações, cotas da CVM para os fundos, benchmarks e um gráfico.
- **Compra e venda:** lógica ancorada em regras e no research.
- **Formatação:** DOCX e PDF gerados por código, com limite de duas páginas verificado.

## 3. Resultado

| | v1 | v2 |
|---|---|---|
| Destinatário | "Prezado João" | "Prezado Albert" |
| Retorno | "3,5%, 0,2 p.p. abaixo do benchmark" (inventado) | +2,51% (+R$ 6.650,04) de 07/04 a 07/05/2025 em ações e fundos (87% do investido); CDI +1,00%, Ibovespa +6,22% |
| Destaques | "quedas" de HAPV3 e ARZZ3 (desde a compra) | HAPV3 +76,44% e LREN3 +8,94% no período; MRFG3 −16,38% |
| Macro | Fed corta em julho, Selic 9%, IPCA 4,0%, dólar 4,70 | Fed sem cortes em 2025, Selic 15,50%, IPCA 6,1%, PIB 2,0%, com citação conferida no relatório |
| Recomendação | "continue diversificando" | R$ 107 mil de caixa parado para Tesouro Selic, Tesouro IPCA+ e multimercado; troca de HAPV3 e MRFG3 por ITUB4 e B3SA3, com estimativa de IR |
| Dados | nenhum alerta | 11 alertas ao assessor (CDB vencido, cotas de 2024, AZZA3, Brave virou FIDC etc.) |
| Formato | texto colado no Word | DOCX e PDF gerados por código, 2 páginas, gráfico, tabelas e disclaimer |
| Verificação | nenhuma | reconciliação 28/28, 23 citações conferidas, 26 números conferidos, revisão de fidelidade sem apontamentos |

**Os testes com a API mostraram onde cada trava é necessária.**

- **Extração:** o gpt-4.1-mini transcreveu tudo certo, menos um subtotal com dígitos trocados (60.131,79 em vez de 60.311,79), e repetiu o erro mesmo recebendo o aviso. A reconciliação barrou a carta. Comparado ao gabarito, o gpt-4.1 acertou todos os campos por US$ 0,02, e por isso ficou com a extração.
- **Macro na carta:** a carta trocou "a Selic pode parar de subir antes" por "possibilidade de estabilização". O regex não pega esse tipo de erro, mas o revisor de fidelidade pegou, e a 2ª versão corrigiu.
- **Nota do CDB:** ao parafrasear a nota, o modelo transformou "após confirmarmos a liquidação" em "já liquidados". Frases operacionais sensíveis passaram a ser escritas pelo código.

**Custo e tempo:** US$ 0,12 por execução completa, incluindo uma rodada de correção. O macro (US$ 0,04) roda uma vez por mês para todos os clientes, então cada cliente custa cerca de US$ 0,08. As chamadas ao LLM somam cerca de um minuto.

## 4. Com um mês de trabalho

- **Dados na fonte:** API de posições da XP, eliminando o parsing de PDF, e cotas CVM/ANBIMA de todos os fundos, com histórico para YTD e 12 meses.
- **Research oficial:** trocar as bandas e a prateleira ilustrativas pela carteira recomendada do XP Research e pelo motor de suitability ANBIMA, com recomendações versionadas e auditáveis.
- **Avaliação contínua:** conjunto de cerca de 30 clientes com gabarito (extração, números e tom), revisor calibrado com rubrica e execução em CI. Isso permite trocar modelo ou prompt com segurança e escolher o modelo mais barato que mantém a qualidade em cada etapa.
- **Produto para o assessor:** tela de revisão (aprovar, editar, enviar), com as edições virando dados de melhoria, e envio por e-mail ou app com rastreio de abertura.
- **Escala:** lote mensal (Batch API), observabilidade por etapa, controle de custo por carta, LGPD e revisão de compliance dos textos padrão.
- **Medição de impacto:** A/B de NPS e share of wallet entre clientes com e sem a carta.
