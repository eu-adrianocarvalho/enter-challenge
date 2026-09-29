/* Node "Code: Reconcile Statement" (dentro do loop Extraction Attempt): confere se o JSON transcrito pelo
   LLM fecha com os subtotais do extrato. Se fechar, done = "true" e o loop termina; se não, as checagens
   que falharam viram o texto de corrections da próxima transcrição. Também registra os tokens. */

const RECONCILIATION_BRL = 0.05;
const RECONCILIATION_PCT = 0.5;
const extraction = input(inputs, 'extraction');
const checks = reconcile(statementFromExtraction(extraction), RECONCILIATION_BRL, RECONCILIATION_PCT);
const failed = checks.filter((c) => !c.passed);
const log = JSON.parse(input(inputs, 'usage_log') || '[]');
log.push({ graph: 'extract_portfolio', model: input(inputs, 'model'), usage: input(inputs, 'usage') || {} });

return typed({
  statement: extraction,
  checks,
  done: failed.length ? 'false' : 'true',
  corrections: failed.length ? failed.map((c) => `- Check "${c.name}" failed: ${c.detail}`).join('\n') : '(none)',
  usage_log: JSON.stringify(log),
});
