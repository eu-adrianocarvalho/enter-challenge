/* Monta o bloco FACTS: todos os números e fatos que o LLM pode usar na carta, já formatados em pt-BR
   (rentabilidade, benchmarks, alocação, recomendações e macro). Também junta a resposta do grafo advise
   aos candidatos calculados, descartando ids desconhecidos. O fact-check exige que todo número da carta
   exista aqui. Depende de format.js, returns.js e suitability.js. */

const CLASS_LABELS = { stock: 'Ações', fund: 'Fundos de investimento', fixed_income: 'Renda fixa' };
const VIEW_LABELS = { favoravel: 'favorável', neutra: 'neutra', desfavoravel: 'desfavorável' };

function recommendationsFromAdvice(advice, candidates) {
  const byId = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const chosen = [];
  const rejected = [];
  for (const item of [...advice.recommendations].sort((a, b) => a.priority - b.priority)) {
    const valid = item.candidate_ids.filter((id) => byId[id]).map((id) => byId[id]);
    rejected.push(...item.candidate_ids.filter((id) => !byId[id]));
    if (valid.length) {
      chosen.push({ priority: chosen.length + 1, title: item.title_pt, rationale: item.rationale_pt, candidates: valid,
        evidenceIds: item.macro_evidence_ids });
    }
  }
  return { recommendations: chosen, rejected };
}

function recommendationLines(recommendation) {
  return recommendation.candidates.map((c) => ({ action: c.action[0].toUpperCase() + c.action.slice(1), asset: c.asset, amount: brl(c.amount) }));
}

function driverFacts(monthly, asset, displayNames) {
  return { asset: displayNames[asset.label] || asset.label, return: pct(asset.returnPct, 2, true), result: brl(asset.pnl, true),
    contribution: pp(contributionPp(monthly, asset.pnl)) };
}

function benchmarkFacts(total, bench) {
  const facts = {};
  if (bench.cdi_pct != null) {
    facts.cdi = pct(bench.cdi_pct, 2, true);
    facts.portfolio_vs_cdi = pp(total.returnPct - bench.cdi_pct);
  }
  if (bench.ibovespa_pct != null) {
    facts.ibovespa = pct(bench.ibovespa_pct, 2, true);
    facts.portfolio_vs_ibovespa = pp(total.returnPct - bench.ibovespa_pct);
  }
  if (bench.ipca_12m_pct != null) {
    facts.ipca_12_months = pct(bench.ipca_12m_pct);
    facts.ipca_12_months_through = monthYearPt(parseIsoDate(bench.ipca_12m_through));
  }
  return facts;
}

function monthFacts(monthly, bench, displayNames) {
  const ranked = [...monthly.assets].sort((a, b) => b.pnl - a.pnl);
  const facts = {
    return: pct(monthly.total.returnPct, 2, true),
    result: brl(monthly.total.pnl, true),
    covers: `ações e fundos, ${pct(monthly.coveragePct, 1)} do total investido`,
    not_covered: monthly.uncovered.map((p) => displayNames[p.label] || p.label),
    by_class: Object.entries(monthly.byClass).map(([name, agg]) => ({ class: CLASS_LABELS[name], return: pct(agg.returnPct, 2, true),
      result: brl(agg.pnl, true), contribution: pp(contributionPp(monthly, agg.pnl)) })),
    top_drivers: ranked.slice(0, 3).filter((a) => a.pnl > 0).map((a) => driverFacts(monthly, a, displayNames)),
    detractors: [...ranked].reverse().slice(0, 2).filter((a) => a.pnl < 0).map((a) => driverFacts(monthly, a, displayNames)),
  };
  if (bench) facts.benchmarks = benchmarkFacts(monthly.total, bench);
  return facts;
}

function macroFacts(macro) {
  return {
    source: `${macro.report_title} (XP Macro Research, ${macro.report_date})`,
    headline: macro.headline_pt || '',
    projections: macro.projections.map((p) => ({ indicator: p.indicator, value: p.value, horizon: p.horizon })),
    themes: macro.themes.map((t) => ({ title: t.title_pt, summary: t.summary_pt })),
    risks: macro.risks.map((r) => r.summary_pt),
    implications: macro.implications.map((i) => ({ view: VIEW_LABELS[i.view] || i.view, summary: i.summary_pt })),
  };
}

function buildFacts(analysis, recommendations, macro) {
  const { statement, period, monthly, sinceStart, benchmarks, allocation, profile, displayNames } = analysis;
  return {
    client: { first_name: statement.firstName, full_name: statement.clientName, account: statement.account },
    advisor: { name: statement.advisorName, code: statement.advisorCode },
    letter_date: longDatePt(statement.statementDate),
    period: { start: dateBr(period.start), end: dateBr(period.end), label: `de ${dateBr(period.start)} a ${dateBr(period.end)}` },
    profile: { label: profile.profile, horizon: profile.horizon, summary: profile.summary_pt },
    wealth: { net_worth: brl(statement.netWorth), invested: brl(statement.invested), cash_available: brl(statement.cash) },
    month: monthFacts(monthly, benchmarks, displayNames),
    since_start: Object.entries(sinceStart).map(([name, agg]) => ({ class: CLASS_LABELS[name], return: pct(agg.returnPct, 2, true),
      result: brl(agg.pnl, true) })),
    allocation: Object.values(allocation).map((a) => ({ bucket: BUCKET_LABELS[a.bucket], current: pct(a.pct, 1),
      target_band: `${a.band.min}% a ${a.band.max}%`, status: a.status })),
    recommendations: recommendations.map((r) => ({ priority: r.priority, title: r.title, rationale: r.rationale, moves: recommendationLines(r) })),
    macro: macroFacts(macro),
  };
}
