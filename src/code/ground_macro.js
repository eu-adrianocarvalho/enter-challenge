/* Node "Code: Check Macro Quotes": recebe o resumo do Subgraph: Macro Outlook e o texto do relatório, mantém
   só as projeções, temas, riscos e implicações cuja citação e cujos números existem no relatório, e
   devolve o macro conferido (objeto e JSON para o Subgraph: Advise) com a lista do que foi descartado. */

const report = input(inputs, 'report_text');
const { macro, report: grounding } = groundOutlook(input(inputs, 'outlook'), report);

return typed({ macro, macro_json: JSON.stringify(macro, null, 2), grounding });
