/* Node "Conferir citações do macro": recebe o resumo do grafo macro_outlook e o texto do relatório, mantém
   só as projeções, temas, riscos e implicações cuja citação e cujos números existem no relatório, e
   devolve o macro conferido (objeto e JSON para o grafo advise) com a lista do que foi descartado. */

const report = input(inputs, 'report_text');
const { macro, report: grounding } = groundOutlook(input(inputs, 'outlook'), report);

return typed({ macro, macro_json: JSON.stringify(macro, null, 2), grounding });
