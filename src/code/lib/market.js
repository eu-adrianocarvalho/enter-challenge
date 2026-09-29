/* Dados de mercado do período: preços das ações (CSV do desafio), retorno dos fundos a partir das cotas
   diárias da CVM (recorte em data/market/cvm_inf_diario_subset.csv) e benchmarks buscados ao vivo
   (CDI e IPCA no Banco Central, Ibovespa no Yahoo Finance), com o arquivo salvo como plano B.
   A estimativa do Brave (FIDC, sem cota diária) vem de config/fund_registry.yaml; o retorno de cada fundo
   usa 4 casas decimais em %, a mesma convenção da versão Python, para as duas darem números idênticos. */

const SGS_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.';
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP';

function parseCsv(text, delimiter = ',') {
  const [header, ...lines] = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const keys = header.split(delimiter).map((k) => k.trim());
  return lines.map((line) => Object.fromEntries(line.split(delimiter).map((v, i) => [keys[i], v.trim()])));
}

function pricesFromCsv(text) {
  return Object.fromEntries(parseCsv(text).map((row) => [row['Asset'], {
    ticker: row['Asset'], current: Number(row['Current price']), previous: Number(row['Last month price']),
  }]));
}

function lastQuoteOnOrBefore(rows, cnpj, day) {
  const eligible = rows.filter((r) => r.CNPJ_FUNDO_CLASSE === cnpj && r.DT_COMPTC <= day);
  if (!eligible.length) return null;
  const latest = eligible.reduce((a, b) => (a.DT_COMPTC >= b.DT_COMPTC ? a : b));
  return { date: latest.DT_COMPTC, quota: Number(latest.VL_QUOTA) };
}

function fundReturnsFromCvm(csvText, registry, start, end) {
  const rows = parseCsv(csvText);
  const returns = [];
  for (const fund of registry) {
    const first = fund.cnpj ? lastQuoteOnOrBefore(rows, fund.cnpj, start) : null;
    const last = fund.cnpj ? lastQuoteOnOrBefore(rows, fund.cnpj, end) : null;
    if (first && last) {
      returns.push({ statementName: fund.statement_name, cnpj: fund.cnpj, returnPct: roundTo((last.quota / first.quota - 1) * 100, 4),
        method: 'Cota diária CVM (inf_diario_fi)', start: first, end: last });
    } else if (fund.monthly_estimate) {
      returns.push({ statementName: fund.statement_name, cnpj: fund.cnpj, returnPct: fund.monthly_estimate.return_pct,
        method: fund.monthly_estimate.method });
    }
  }
  return returns;
}

function compoundPct(ratesPct) {
  return (ratesPct.reduce((factor, rate) => factor * (1 + rate / 100), 1) - 1) * 100;
}

async function sgs(fetch, series, startBr, endBr) {
  const response = await fetch(`${SGS_URL}${series}/dados?formato=json&dataInicial=${startBr}&dataFinal=${endBr}`);
  if (!response.ok) throw new Error(`BCB SGS ${series}: HTTP ${response.status}`);
  return (await response.json()).map((row) => ({ date: parseBrDate(row.data), value: Number(row.valor) }));
}

function lastPublishedIpcaMonth(asOf) {
  let candidate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0));
  while (daysBetween(asOf, candidate) < 10) candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), 0));
  return new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), 1));
}

async function ibovespaPct(fetch, start, end) {
  const from = Math.floor(start.getTime() / 1000) - 7 * 86400;
  const to = Math.floor(end.getTime() / 1000) + 86400;
  const response = await fetch(`${YAHOO_URL}?period1=${from}&period2=${to}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`Yahoo: HTTP ${response.status}`);
  const result = (await response.json()).chart.result[0];
  const closes = result.timestamp.map((ts, i) => ({ ts, close: result.indicators.quote[0].close[i] })).filter((c) => c.close != null);
  const closeOn = (day) => closes.filter((c) => c.ts <= day.getTime() / 1000 + 86399).pop().close;
  return (closeOn(end) / closeOn(start) - 1) * 100;
}

async function fetchBenchmarks(fetch, start, end) {
  const cdi = await sgs(fetch, 12, dateBr(start), dateBr(end));
  const through = lastPublishedIpcaMonth(end);
  const ipcaFrom = new Date(Date.UTC(through.getUTCFullYear() - 1, through.getUTCMonth(), 1));
  const ipca = await sgs(fetch, 433, dateBr(ipcaFrom), dateBr(through));
  return {
    period_start: isoDate(start), period_end: isoDate(end),
    cdi_pct: compoundPct(cdi.filter((r) => r.date >= start && r.date < end).map((r) => r.value)),
    ibovespa_pct: await ibovespaPct(fetch, start, end),
    ipca_12m_pct: compoundPct(ipca.filter((r) => r.date <= through).slice(-12).map((r) => r.value)),
    ipca_12m_through: isoDate(through),
    source: 'BCB SGS (CDI série 12, IPCA série 433) e Yahoo Finance (^BVSP), buscado ao vivo pelo Rivet',
  };
}
