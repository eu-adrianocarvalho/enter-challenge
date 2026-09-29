/* Fact-check determinístico da carta: extrai todo percentual, valor em R$ e p.p. do texto e exige que
   cada um exista, idêntico, no bloco FACTS (arredondamentos como "R$ 40 mil" são rejeitados).
   Também confere a saudação com o nome do cliente, proíbe listas e aponta palavras duplicadas.
   As falhas viram instruções de correção (em inglês, como os prompts) para a próxima versão da carta. */

const DATE_PATTERN = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
const FIGURE_PATTERN = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?(?:\s?(?:mil|milhões|milhão|bilhões|bi))?|\d+(?:\.\d{3})*(?:,\d+)?\s?(?:%|p\.p\.)|\d+,\d+/g;
const REPEATED_WORD = /(?<![A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]{3,})\s+\1(?![A-Za-zÀ-ÿ])/giu;

function figures(text) {
  return String(text).replace(DATE_PATTERN, ' ').match(FIGURE_PATTERN) || [];
}

function normalizeFigure(figure) {
  return figure.replace(/\s+/g, '').replace(/−/g, '-').replace(/^[+-]+/, '');
}

function allowedFigures(facts) {
  return new Set(figures(JSON.stringify(facts)).map(normalizeFigure));
}

function checkLetter(letter, facts, firstName) {
  const text = Object.values(letter).join('\n');
  const allowed = allowedFigures(facts);
  const found = figures(text);
  const unsupported = [...new Set(found.filter((f) => !allowed.has(normalizeFigure(f))))].sort();
  const issues = [];
  if (!String(letter.greeting || '').includes(firstName)) {
    issues.push(`The greeting must address the client by first name: "Prezado ${firstName},".`);
  }
  if (/^\s*[-•*]\s/m.test(text)) issues.push('Do not use bullet points; write paragraphs.');
  for (const repeated of [...new Set([...text.matchAll(REPEATED_WORD)].map((m) => m[0]))].sort()) {
    issues.push(`The words "${repeated}" are duplicated; check the spelling of names against FACTS.`);
  }
  return { checked: found.length, unsupported, issues, passed: !unsupported.length && !issues.length };
}

function factcheckCorrections(result) {
  const lines = result.unsupported.map((f) => `- The figure "${f}" is not in FACTS. Remove it or replace it with a FACTS value.`);
  return [...lines, ...result.issues.map((issue) => `- ${issue}`)];
}
