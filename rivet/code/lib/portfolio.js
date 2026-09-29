/* Modelo do extrato do cliente e as checagens de reconciliação que validam a transcrição feita pelo LLM:
   investido + saldo = patrimônio, soma das classes = investido, posições = subtotal de cada classe,
   quantidade × preço = posição, aplicado × (1 + rentabilidade) = posição e % de alocação.
   Se alguma falhar, o grafo pede uma nova transcrição; se persistir, a carta é bloqueada. */

const ASSET_CLASSES = ['stock', 'fund', 'fixed_income'];

function statementFromExtraction(data) {
  return {
    clientName: data.client_name,
    firstName: String(data.client_name).split(' ')[0],
    account: data.account,
    statementDate: parseBrDate(data.statement_date),
    advisorCode: data.advisor_code,
    advisorName: data.advisor_name,
    netWorth: data.net_worth,
    invested: data.invested,
    cash: data.cash,
    classTotals: Object.fromEntries(data.class_totals.map((row) => [row.asset_class, row])),
    positions: data.positions.map((p) => ({ ...p, ticker: p.ticker || null, label: p.ticker || p.name })),
  };
}

function positionsOf(statement, assetClass) {
  return statement.positions.filter((p) => p.asset_class === assetClass);
}

function costBasis(position) {
  if (position.quantity != null && position.average_price != null) return position.quantity * position.average_price;
  return position.invested_amount;
}

function relativeGapPct(actual, expected) {
  return expected ? Math.abs(actual / expected - 1) * 100 : Infinity;
}

function totalChecks(statement, toleranceBrl) {
  const subtotalSum = Object.values(statement.classTotals).reduce((sum, row) => sum + row.subtotal, 0);
  return [
    { name: 'investido + saldo = patrimônio',
      passed: Math.abs(statement.invested + statement.cash - statement.netWorth) <= toleranceBrl,
      detail: `${statement.invested.toFixed(2)} + ${statement.cash.toFixed(2)} vs ${statement.netWorth.toFixed(2)}` },
    { name: 'soma das classes = investido',
      passed: Math.abs(subtotalSum - statement.invested) <= toleranceBrl,
      detail: `${subtotalSum.toFixed(2)} vs ${statement.invested.toFixed(2)}` },
  ];
}

function classChecks(statement, toleranceBrl) {
  return Object.entries(statement.classTotals).map(([assetClass, row]) => {
    const sum = positionsOf(statement, assetClass).reduce((total, p) => total + p.value, 0);
    return { name: `posições de ${assetClass} = subtotal`, passed: Math.abs(sum - row.subtotal) <= toleranceBrl,
      detail: `${sum.toFixed(2)} vs ${row.subtotal.toFixed(2)}` };
  });
}

function positionChecks(position, statement, tolerancePct) {
  const checks = [];
  if (position.quantity != null && position.last_price != null) {
    const implied = position.quantity * position.last_price;
    checks.push({ name: `${position.label}: quantidade × preço = posição`,
      passed: relativeGapPct(implied, position.value) <= tolerancePct, detail: `${implied.toFixed(2)} vs ${position.value.toFixed(2)}` });
  } else if (position.invested_amount && position.return_since_start_pct != null) {
    const implied = position.invested_amount * (1 + position.return_since_start_pct / 100);
    checks.push({ name: `${position.label}: aplicado × (1 + rentabilidade) = posição`,
      passed: relativeGapPct(implied, position.value) <= tolerancePct, detail: `${implied.toFixed(2)} vs ${position.value.toFixed(2)}` });
  }
  const allocation = position.value / statement.invested * 100;
  checks.push({ name: `${position.label}: % alocação`, passed: Math.abs(allocation - position.allocation_pct) <= 0.05,
    detail: `${allocation.toFixed(2)}% vs ${position.allocation_pct.toFixed(2)}%` });
  return checks;
}

function reconcile(statement, toleranceBrl, tolerancePct) {
  return [
    ...totalChecks(statement, toleranceBrl),
    ...classChecks(statement, toleranceBrl),
    ...statement.positions.flatMap((p) => positionChecks(p, statement, tolerancePct)),
  ];
}
