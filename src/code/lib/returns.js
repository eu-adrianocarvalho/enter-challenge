/* Rentabilidade do período por ativo, por classe e da carteira, e o resultado desde a aplicação por classe.
   Ações usam quantidade × preços do CSV; fundos usam o retorno da cota (CVM) aplicado à posição.
   Posições sem dado confiável (o CDB vencido) ficam de fora e a cobertura (% do investido) é informada. */

function aggregate(name, assets) {
  const start = assets.reduce((sum, a) => sum + a.start, 0);
  const end = assets.reduce((sum, a) => sum + a.end, 0);
  return { name, start, end, pnl: end - start, returnPct: start ? (end / start - 1) * 100 : 0 };
}

function stockReturn(position, prices) {
  const pair = prices[position.ticker || ''];
  if (!pair || position.quantity == null) return null;
  return { label: position.label, name: position.name, assetClass: position.asset_class,
    start: position.quantity * pair.previous, end: position.quantity * pair.current, source: 'preços de fechamento (CSV)' };
}

function fundReturn(position, fundReturns) {
  const found = fundReturns.find((f) => f.statementName === position.name);
  if (!found) return null;
  return { label: position.label, name: position.name, assetClass: position.asset_class,
    start: position.value / (1 + found.returnPct / 100), end: position.value, source: found.method };
}

function monthlyReturns(statement, prices, fundReturns) {
  const assets = [];
  const uncovered = [];
  for (const position of statement.positions) {
    let result = null;
    if (position.asset_class === 'stock') result = stockReturn(position, prices);
    if (position.asset_class === 'fund') result = fundReturn(position, fundReturns);
    (result ? assets : uncovered).push(result || position);
  }
  for (const asset of assets) {
    asset.pnl = asset.end - asset.start;
    asset.returnPct = (asset.end / asset.start - 1) * 100;
  }
  const total = aggregate('portfolio', assets);
  const classes = [...new Set(assets.map((a) => a.assetClass))].sort();
  const byClass = Object.fromEntries(classes.map((c) => [c, aggregate(c, assets.filter((a) => a.assetClass === c))]));
  const coveragePct = assets.reduce((sum, a) => sum + a.end, 0) / statement.invested * 100;
  return { assets, uncovered, total, byClass, coveragePct };
}

function contributionPp(monthly, pnl) {
  return pnl / monthly.total.start * 100;
}

function sinceStartByClass(statement) {
  const result = {};
  for (const assetClass of Object.keys(statement.classTotals)) {
    const positions = positionsOf(statement, assetClass).filter((p) => costBasis(p) != null);
    const cost = positions.reduce((sum, p) => sum + costBasis(p), 0);
    const value = positions.reduce((sum, p) => sum + p.value, 0);
    result[assetClass] = { name: assetClass, start: cost, end: value, pnl: value - cost, returnPct: (value / cost - 1) * 100 };
  }
  return result;
}
