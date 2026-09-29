/* Alertas de qualidade de dados que o assessor precisa ver antes de enviar a carta: CDB vencido, caixa
   ocioso, variação atípica no mês, ticker renomeado, fundo transformado, cotas e research defasados,
   crédito privado sem checagem de rating, concentração, retornos estimados e posições sem dado mensal.
   Cada alerta tem severidade; o do CDB traz a nota que a carta imprime abaixo da tabela de sugestões. */

function flag(code, severity, message, clientNote = null) {
  return { code, severity, message, clientNote };
}

function maturedFixedIncome(statement) {
  return positionsOf(statement, 'fixed_income').filter((p) => isMatured(p, statement)).map((p) => {
    const maturity = dateBr(parseBrDate(p.maturity_date));
    return flag('MATURED_FIXED_INCOME', 'alta',
      `${p.name} venceu em ${maturity}, mas o extrato de ${dateBr(statement.statementDate)} ainda mostra posição de ${brl(p.value)}. Confirmar a liquidação antes de reinvestir.`,
      `O ${p.name} teve vencimento em ${maturity}; após confirmarmos a liquidação, esses recursos fazem parte da sugestão de reaplicação.`);
  });
}

function idleCash(statement, thresholdPct) {
  const matured = positionsOf(statement, 'fixed_income').filter((p) => isMatured(p, statement)).reduce((s, p) => s + p.value, 0);
  const idle = statement.cash + matured;
  const share = idle / statement.netWorth * 100;
  if (share <= thresholdPct) return [];
  return [flag('IDLE_CASH', 'alta', `${brl(idle)} (${pct(share, 1)} do patrimônio) em saldo disponível e renda fixa vencida, sem rendimento.`)];
}

function largeMoves(monthly, thresholdPct) {
  return monthly.assets.filter((a) => Math.abs(a.returnPct) > thresholdPct).map((a) => flag('LARGE_MONTHLY_MOVE', 'média',
    `${a.label} variou ${pct(a.returnPct, 2, true)} no período. Verificar evento corporativo (grupamento, desdobramento, proventos) antes de enviar.`));
}

function renamedTickers(statement, shelf) {
  return positionsOf(statement, 'stock').filter((p) => shelf.stocks[p.ticker] && shelf.stocks[p.ticker].renamed_to)
    .map((p) => flag('RENAMED_TICKER', 'média', `${p.ticker} passou a negociar como ${shelf.stocks[p.ticker].renamed_to}. Atualizar o cadastro do ativo.`));
}

function registryNotes(registry) {
  return registry.filter((f) => f.registry_note).map((f) => flag('FUND_REGISTRY_CHANGE', 'média', `${f.statement_name}: ${f.registry_note}`));
}

function staleQuotes(statement, maxAgeDays) {
  const stale = statement.positions.map((p) => parseBrDate(p.quote_date)).filter((d) => d && daysBetween(statement.statementDate, d) > maxAgeDays);
  if (!stale.length) return [];
  const oldest = new Date(Math.min(...stale));
  return [flag('STALE_QUOTES', 'média', `${stale.length} fundos com data da cota defasada (a mais antiga, ${dateBr(oldest)}, está `
    + `${daysBetween(statement.statementDate, oldest)} dias antes do extrato). O retorno do mês usa cotas da CVM.`)];
}

function researchAge(reportDate, statement, maxAgeDays) {
  if (!reportDate || daysBetween(statement.statementDate, reportDate) <= maxAgeDays) return [];
  return [flag('STALE_RESEARCH', 'média', `O relatório macro é de ${dateBr(reportDate)}, ${daysBetween(statement.statementDate, reportDate)} dias `
    + 'antes do extrato. Em produção, usar a edição mais recente.')];
}

function creditUnverified(statement, registry, minRating) {
  const names = new Set(registry.filter((f) => f.credit_private).map((f) => f.statement_name));
  const credit = positionsOf(statement, 'fund').filter((p) => names.has(p.name));
  if (!credit.length) return [];
  const share = credit.reduce((s, p) => s + p.value, 0) / statement.netWorth * 100;
  const rule = minRating ? `rating mínimo ${minRating}` : 'a qualidade de crédito exigida pelo perfil';
  return [flag('CREDIT_RATING_UNVERIFIED', 'média', `${pct(share, 1)} do patrimônio em fundos de crédito privado (${credit.map((p) => p.name).join(', ')}). `
    + `Confirmar se as carteiras respeitam ${rule}.`)];
}

function concentration(statement, thresholdPct) {
  return positionsOf(statement, 'stock').filter((p) => p.value / statement.netWorth * 100 > thresholdPct)
    .map((p) => flag('CONCENTRATION', 'info', `${p.ticker} representa ${pct(p.value / statement.netWorth * 100, 1)} do patrimônio.`));
}

function estimatedReturns(fundReturns) {
  return fundReturns.filter((r) => !r.method.startsWith('Cota diária'))
    .map((r) => flag('ESTIMATED_RETURN', 'info', `${r.statementName}: retorno do mês estimado. ${r.method}.`));
}

function uncoveredPositions(monthly) {
  if (!monthly.uncovered.length) return [];
  return [flag('NO_MONTHLY_DATA', 'info', `Sem dado mensal confiável para: ${monthly.uncovered.map((p) => p.label).join(', ')}. Fora do cálculo do mês.`)];
}

function assessQuality(statement, monthly, fundReturns, registry, shelf, thresholds, reportDate, minRating) {
  return [
    ...maturedFixedIncome(statement), ...idleCash(statement, thresholds.idle_cash_pct),
    ...largeMoves(monthly, thresholds.large_monthly_move_pct), ...renamedTickers(statement, shelf), ...registryNotes(registry),
    ...staleQuotes(statement, thresholds.stale_quote_days), ...researchAge(reportDate, statement, thresholds.research_age_days),
    ...creditUnverified(statement, registry, minRating), ...concentration(statement, thresholds.single_stock_pct),
    ...estimatedReturns(fundReturns), ...uncoveredPositions(monthly),
  ];
}
