/* Node "Code: Analyze Portfolio": com o extrato reconciliado, o perfil, o macro conferido e os dados de
   mercado, calcula a rentabilidade do período e desde a aplicação, a alocação contra as faixas do perfil,
   os candidatos de compra e venda com valor e IR e os alertas de dados. Para a execução se o extrato não
   reconciliou (a carta é bloqueada) e devolve os JSONs que o Subgraph: Advise recebe. */

const setup = input(inputs, 'context');
const market = input(inputs, 'market');
const profile = input(inputs, 'profile');
const macro = input(inputs, 'macro');
const checks = input(inputs, 'checks');
if (input(inputs, 'extraction_done') !== 'true') {
  const failed = checks.filter((c) => !c.passed).map((c) => `${c.name} (${c.detail})`).join('; ');
  throw new Error(`Carta BLOQUEADA: o extrato transcrito não reconcilia depois de 2 tentativas: ${failed}`);
}
const { settings, shelf, registry } = setup;
const bands = setup.bands[profile.profile];
if (!bands) throw new Error(`Não há faixas de alocação para o perfil "${profile.profile}" em config/.`);

const extraction = input(inputs, 'statement');
const statement = statementFromExtraction(extraction);
const monthly = monthlyReturns(statement, market.prices, market.fundReturns);
const allocation = currentAllocation(statement, registry, bands);
const rebalancing = rebalancingCandidates(deployableAmounts(allocation, statement.netWorth, bands), bands, shelf);
const swaps = stockSwapCandidates(statement, shelf, market.prices, bands.rounding_brl);
const candidates = [...rebalancing, ...swaps.candidates];
const flags = assessQuality(statement, monthly, market.fundReturns, registry, shelf, settings.thresholds,
  parseBrDate(macro.report_date), profile.min_credit_rating);
const allocationFacts = Object.values(allocation).map((a) => ({ bucket: BUCKET_LABELS[a.bucket], current: pct(a.pct, 1),
  target_band: `${a.band.min}% a ${a.band.max}%`, status: a.status }));
const candidatesPayload = candidates.map((c) => ({ id: c.id, action: c.action, asset: c.asset, bucket: BUCKET_LABELS[c.bucket],
  rule: c.rule, thesis: c.thesis }));

return typed({
  analysis: {
    extraction, checks, period: { start: settings.period.start, end: settings.period.end }, monthly,
    sinceStart: sinceStartByClass(statement), benchmarks: market.benchmarks, benchmarkOrigin: market.benchmarkOrigin,
    fundReturns: market.fundReturns, allocation, candidates, tax: swaps.tax, flags, profile,
    displayNames: Object.fromEntries(registry.filter((f) => f.display_name).map((f) => [f.statement_name, f.display_name])),
  },
  profile_json: JSON.stringify(profile, null, 2),
  allocation_json: JSON.stringify(allocationFacts, null, 2),
  candidates_json: JSON.stringify(candidatesPayload, null, 2),
});
