/* Confere se o resumo macro feito pelo LLM está ancorado no relatório da XP. Cada projeção, tema e risco
   traz uma citação que precisa aparecer no texto do relatório (palavras em ordem, tolerando quebras do
   PDF, mas nunca um número diferente); os resumos só podem usar números que existem no relatório.
   Itens sem base são descartados e listados no brief. Depende de factcheck.js (função figures). */

const TOKEN_PATTERN = /[\p{L}\p{N}_]+(?:[.,][\p{L}\p{N}_]+)*/gu;
const YEAR_PATTERN = /^(19|20)\d{2}$/;
const WINDOW_SLACK = 1.6;
const MISSING_WORDS_ALLOWED = 0.1;

function tokens(text) {
  return String(text).normalize('NFC').replace(/-\n/g, '').toLowerCase().match(TOKEN_PATTERN) || [];
}

function isNumberToken(word) {
  return /\d/.test(word);
}

function matchesFrom(source, start, quote) {
  const limit = Math.min(source.length, start + Math.floor(quote.length * WINDOW_SLACK) + 3);
  let misses = Math.floor(quote.length * MISSING_WORDS_ALLOWED);
  let position = start;
  for (const word of quote) {
    let found = -1;
    for (let i = position; i < limit; i += 1) if (source[i] === word) { found = i; break; }
    if (found >= 0) position = found + 1;
    else if (isNumberToken(word) || misses === 0) return false;
    else misses -= 1;
  }
  return true;
}

function isGrounded(quote, sourceTokens) {
  const quoteTokens = tokens(quote);
  if (quoteTokens.length < 3) return false;
  return sourceTokens.some((word, index) => word === quoteTokens[0] && matchesFrom(sourceTokens, index, quoteTokens));
}

function figuresSupported(text, vocabulary) {
  return figures(text).every((figure) => tokens(figure).every((t) => vocabulary.has(t)));
}

function valueInQuote(item) {
  const quoteTokens = new Set(tokens(item.quote));
  return tokens(item.value).filter((w) => isNumberToken(w) && !YEAR_PATTERN.test(w)).every((w) => quoteTokens.has(w));
}

function itemIsValid(section, item, source, vocabulary) {
  const written = Object.entries(item).filter(([key]) => key.endsWith('_pt')).map(([, v]) => v).join(' ');
  if (!isGrounded(item.quote, source) || !figuresSupported(written, vocabulary)) return false;
  return section !== 'projections' || valueInQuote(item);
}

function groundOutlook(outlook, reportText) {
  const source = tokens(reportText);
  const vocabulary = new Set(source);
  const dropped = [];
  const grounded = { ...outlook };
  for (const section of ['projections', 'themes', 'risks']) {
    grounded[section] = outlook[section].filter((item) => {
      const valid = itemIsValid(section, item, source, vocabulary);
      if (!valid) dropped.push(item.id);
      return valid;
    });
  }
  const validIds = new Set(['projections', 'themes', 'risks'].flatMap((s) => grounded[s].map((i) => i.id)));
  grounded.implications = [];
  for (const item of outlook.implications) {
    if (item.evidence_ids.some((e) => validIds.has(e)) && figuresSupported(item.summary_pt, vocabulary)) {
      grounded.implications.push({ ...item, evidence_ids: item.evidence_ids.filter((e) => validIds.has(e)) });
    } else {
      dropped.push(item.id);
    }
  }
  if (!figuresSupported(outlook.headline_pt || '', vocabulary)) {
    grounded.headline_pt = '';
    dropped.push('headline_pt');
  }
  const kept = ['projections', 'themes', 'risks', 'implications'].reduce((sum, s) => sum + grounded[s].length, 0);
  return { macro: grounded, report: { kept, dropped } };
}
