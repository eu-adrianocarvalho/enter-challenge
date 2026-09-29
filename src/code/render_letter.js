/* Node "Code: Render Letter (HTML)": recebe a carta aprovada, os FACTS e a análise e monta o HTML final com a
   identidade da XP, em duas folhas A4, com o gráfico em SVG, as tabelas e a observação operacional do CDB
   escrita pelo código. O HTML vai para o node Code: Publish, que o grava em Output/ e o converte em PDF. */

const analysis = input(inputs, 'analysis');
const setup = input(inputs, 'context');
const notes = analysis.flags.filter((f) => f.clientNote).map((f) => f.clientNote);
const html = renderLetterHtml(input(inputs, 'letter'), input(inputs, 'facts'), analysis.monthly, analysis.benchmarks, notes, setup.logo);

return typed({ html });
