/* Node "Montar FACTS": junta a resposta do grafo advise aos candidatos calculados (descartando ids que não
   existem e mantendo os valores do código) e monta o bloco FACTS, com todos os números da carta já
   formatados em pt-BR. O JSON dos FACTS é o que o grafo write_letter recebe. */

const analysis = input(inputs, 'analysis');
const advice = input(inputs, 'advice');
const macro = input(inputs, 'macro');
const { recommendations, rejected } = recommendationsFromAdvice(advice, analysis.candidates);
const facts = buildFacts({
  statement: statementFromExtraction(analysis.extraction),
  period: { start: parseIsoDate(analysis.period.start), end: parseIsoDate(analysis.period.end) },
  monthly: analysis.monthly,
  sinceStart: analysis.sinceStart,
  benchmarks: analysis.benchmarks,
  allocation: analysis.allocation,
  profile: analysis.profile,
  displayNames: analysis.displayNames,
}, recommendations, macro);

return typed({
  facts,
  facts_json: JSON.stringify(facts, null, 2),
  recommendations: { list: recommendations, rejected, advisorNotes: advice.advisor_notes_pt || [] },
});
