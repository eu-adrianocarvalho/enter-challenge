/* Compara a alocação atual com as faixas do perfil (config/allocation_moderate.yaml) e gera os candidatos
   de compra e venda com valor em reais: reaplicar o caixa excedente nas classes abaixo do alvo e trocar
   ações fora do perfil por pagadoras de dividendos (config/research_shelf.yaml).
   Também estima o IR das vendas. O LLM só escolhe e explica esses candidatos; nunca define valores. */

const BUCKET_LABELS = { fixed_income: 'Renda fixa', multimarket: 'Multimercado', equities: 'Renda variável', cash: 'Caixa e vencidos' };
const INVESTABLE_BUCKETS = ['fixed_income', 'multimarket', 'equities'];
const STOCK_SALE_EXEMPTION_BRL = 20000;

function isMatured(position, statement) {
  const maturity = parseBrDate(position.maturity_date);
  return Boolean(maturity && maturity < statement.statementDate);
}

function bucketOf(position, fundBuckets, statement) {
  if (position.asset_class === 'stock') return 'equities';
  if (position.asset_class === 'fund') return fundBuckets[position.name] || 'multimarket';
  return isMatured(position, statement) ? 'cash' : 'fixed_income';
}

function allocationStatus(pctValue, band) {
  if (pctValue < band.min) return 'abaixo';
  return pctValue > band.max ? 'acima' : 'dentro';
}

function currentAllocation(statement, registry, bands) {
  const fundBuckets = Object.fromEntries(registry.map((f) => [f.statement_name, f.bucket]));
  const values = { fixed_income: 0, multimarket: 0, equities: 0, cash: statement.cash };
  for (const position of statement.positions) values[bucketOf(position, fundBuckets, statement)] += position.value;
  return Object.fromEntries(Object.entries(values).map(([bucket, value]) => {
    const share = value / statement.netWorth * 100;
    const band = bands.buckets[bucket];
    return [bucket, { bucket, value, pct: share, band, status: allocationStatus(share, band) }];
  }));
}

function deployableAmounts(allocation, netWorth, bands) {
  const surplus = allocation.cash.value - netWorth * bands.buckets.cash.target / 100;
  if (surplus <= 0) return {};
  const gaps = Object.fromEntries(INVESTABLE_BUCKETS.map((b) =>
    [b, Math.max(0, netWorth * allocation[b].band.target / 100 - allocation[b].value)]));
  const totalGap = Object.values(gaps).reduce((a, b) => a + b, 0);
  const scale = totalGap ? Math.min(1, surplus / totalGap) : 0;
  const deploy = Object.fromEntries(Object.entries(gaps).filter(([, gap]) => gap > 0).map(([b, gap]) => [b, gap * scale]));
  const leftover = surplus - Object.values(deploy).reduce((a, b) => a + b, 0);
  deploy[bands.surplus_bucket] = (deploy[bands.surplus_bucket] || 0) + leftover;
  return deploy;
}

function roundDown(value, step) {
  return Math.floor(value / step) * step;
}

function rebalancingCandidates(deploy, bands, shelf) {
  const legs = [];
  if (deploy.fixed_income) {
    legs.push(['reinvest_post_fixed', 'post_fixed', deploy.fixed_income * bands.fixed_income_split.post_fixed]);
    legs.push(['reinvest_inflation_linked', 'inflation_linked', deploy.fixed_income * bands.fixed_income_split.inflation_linked]);
  }
  if (deploy.multimarket) legs.push(['add_multimarket', 'multimarket', deploy.multimarket]);
  return legs.map(([id, key, amount]) => {
    const product = shelf.products[key];
    return { id, action: 'aplicar', asset: product.name, amount: roundDown(amount, bands.rounding_brl), bucket: product.bucket,
      rule: `Caixa e renda fixa vencida acima da banda; leva ${BUCKET_LABELS[product.bucket]} para o alvo do perfil.`,
      thesis: product.thesis };
  }).filter((c) => c.amount >= bands.rounding_brl);
}

function taxNote(totalSales, realized) {
  const net = Object.values(realized).reduce((a, b) => a + b, 0);
  const exempt = totalSales <= STOCK_SALE_EXEMPTION_BRL;
  const parts = Object.entries(realized).map(([ticker, value]) => `${ticker} ${brl(value, true)}`).join(', ');
  const outcome = net <= 0 ? 'sem IR a pagar' : `IR de 15% sobre ${brl(net)}`;
  const carry = net < 0 ? `; prejuízo de ${brl(-net)} a compensar no futuro` : '';
  const summary = exempt
    ? `Vendas de ${brl(totalSales)} no mês ficam na isenção de ${brl(STOCK_SALE_EXEMPTION_BRL)}.`
    : `Vendas de ${brl(totalSales)} superam a isenção mensal de ${brl(STOCK_SALE_EXEMPTION_BRL)}. Resultado realizado: ${parts}. `
      + `Saldo ${brl(net, true)}, ${outcome}${carry}. Estimativa; confirmar com a área tributária.`;
  return { totalSales, realized, net, exempt, summary };
}

function stockSwapCandidates(statement, shelf, prices, step) {
  const misfits = positionsOf(statement, 'stock').filter((p) => shelf.stocks[p.ticker] && shelf.stocks[p.ticker].profile_fit === false);
  if (!misfits.length) return { candidates: [], tax: null };
  const saleValues = Object.fromEntries(misfits.map((p) => [p.ticker, p.quantity * prices[p.ticker].current]));
  const sells = misfits.map((p) => ({ id: `sell_${p.ticker}`, action: 'vender', asset: p.ticker, amount: saleValues[p.ticker],
    bucket: 'equities', rule: 'Ação fora do perfil moderado (não é pagadora consistente de dividendos).',
    thesis: 'o perfil prevê ações de empresas consolidadas que pagam dividendos' }));
  const buyList = Object.entries(shelf.stocks).filter(([, info]) => info.buy_list).map(([ticker]) => ticker);
  const perBuy = roundDown(Object.values(saleValues).reduce((a, b) => a + b, 0) / buyList.length, step);
  const buys = perBuy >= step ? buyList.map((ticker) => ({ id: `buy_${ticker}`, action: 'comprar', asset: ticker, amount: perBuy,
    bucket: 'equities', rule: 'Reposição com os recursos das vendas, sem alterar o peso de renda variável.',
    thesis: 'empresa consolidada e pagadora de dividendos, alinhada ao perfil' })) : [];
  const realized = Object.fromEntries(misfits.map((p) => [p.ticker, p.quantity * (prices[p.ticker].current - p.average_price)]));
  const totalSales = Object.values(saleValues).reduce((a, b) => a + b, 0);
  return { candidates: [...sells, ...buys], tax: taxNote(totalSales, realized) };
}
