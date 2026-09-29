/* Node "Code: Decide Letter Version" (fim do loop Letter Attempt): junta os problemas do fact-check, os
   apontamentos graves do revisor e o limite de palavras. Sem problemas, done = "true" e o loop termina;
   com problemas, eles viram o texto de corrections da próxima versão (até 3). Também registra os tokens. */

const letter = input(inputs, 'letter');
const factcheck = input(inputs, 'factcheck');
const review = input(inputs, 'review') || { issues: [] };
const budget = Number(input(inputs, 'word_budget'));
const majors = (review.issues || []).filter((i) => i.severity === 'major');
const words = Object.values(letter).join(' ').split(/\s+/).filter(Boolean).length;
const problems = [
  ...(factcheck.passed ? [] : factcheckCorrections(factcheck)),
  ...majors.map((i) => `- In ${i.field}: "${i.excerpt}". ${i.problem}`),
  ...(words > budget * 1.1 ? [`- The draft has ${words} words; the limit is ${budget}.`] : []),
];
const model = input(inputs, 'model');
const log = JSON.parse(input(inputs, 'usage_log') || '[]');
log.push({ graph: 'write_letter', model, usage: input(inputs, 'write_usage') || {} });
log.push({ graph: 'review_letter', model, usage: input(inputs, 'review_usage') || {} });

return typed({
  letter,
  review: { majors, all: review.issues || [] },
  done: problems.length ? 'false' : 'true',
  corrections: problems.length ? problems.join('\n') : '(none)',
  usage_log: JSON.stringify(log),
});
