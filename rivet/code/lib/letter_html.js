/* Monta a carta ao cliente em HTML com a identidade da XP (faixa preta com logo, filete amarelo,
   indicadores em preto e amarelo, gráfico em SVG, tabelas e disclaimer), em duas folhas A4: a página 1
   traz o desempenho e a alocação; a página 2, o cenário e as sugestões. O mesmo HTML vira PDF no
   navegador headless (publish.js). Depende de format.js e facts.js. */

const XP_YELLOW = '#FFC709';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function chartSeries(monthly, bench) {
  const series = [['Sua carteira', monthly.total.returnPct, XP_YELLOW]];
  for (const name of ['stock', 'fund']) {
    if (monthly.byClass[name]) series.push([CLASS_LABELS[name].replace(' de investimento', ''), monthly.byClass[name].returnPct, '#1A1A1A']);
  }
  if (bench && bench.cdi_pct != null) series.push(['CDI', bench.cdi_pct, '#BDBDBD']);
  if (bench && bench.ibovespa_pct != null) series.push(['Ibovespa', bench.ibovespa_pct, '#BDBDBD']);
  return series;
}

function barChartSvg(series) {
  const labelWidth = 110, width = 620, barHeight = 20, gap = 9;
  const plot = width - labelWidth - 70;
  const low = Math.min(0, ...series.map((s) => s[1]));
  const high = Math.max(...series.map((s) => s[1]));
  const x = (v) => labelWidth + ((v - low) / (high - low || 1)) * plot;
  const height = series.length * (barHeight + gap) + gap;
  const bars = series.map(([label, value, color], i) => {
    const y = gap + i * (barHeight + gap);
    const start = Math.min(x(0), x(value));
    const barWidth = Math.max(1, Math.abs(x(value) - x(0)));
    return `<text x="${labelWidth - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="11" fill="#222">${escapeHtml(label)}</text>`
      + `<rect x="${start}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}"/>`
      + `<text x="${x(value) + (value >= 0 ? 6 : -6)}" y="${y + barHeight / 2 + 4}" text-anchor="${value >= 0 ? 'start' : 'end'}" font-size="10.5" fill="#222">${escapeHtml(pct(value, 2, true))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Retorno no período">`
    + `<line x1="${x(0)}" y1="0" x2="${x(0)}" y2="${height}" stroke="#9CA3AF" stroke-width="1"/>${bars}</svg>`;
}

function disclaimerText(facts) {
  return 'Este material tem caráter informativo e não constitui oferta ou solicitação de compra ou venda de ativos. '
    + 'As sugestões dependem da confirmação de adequação ao seu perfil (suitability) e da sua autorização prévia. '
    + 'Rentabilidade passada não é garantia de rentabilidade futura; valores brutos de impostos. Retorno do período calculado '
    + `com preços de fechamento e cotas diárias publicadas pela CVM. Fontes: extrato XP de ${facts.period.end}, CVM, Banco Central `
    + `do Brasil, Yahoo Finance e ${facts.macro.source}.`;
}

function band(logoDataUri) {
  return `<div class="band"><img src="${logoDataUri}" alt="XP"><div class="title">Relatório mensal de investimentos`
    + '<small>Assessoria de Investimentos</small></div></div>';
}

function kpiBoxes(facts) {
  const bench = facts.month.benchmarks || {};
  const boxes = [['Patrimônio total', facts.wealth.net_worth], ['Retorno no período*', facts.month.return],
    ['Resultado no período*', facts.month.result], ['CDI | Ibovespa', `${bench.cdi || '–'} | ${bench.ibovespa || '–'}`]];
  return `<div class="kpis">${boxes.map(([l, v]) => `<div class="kpi"><span>${escapeHtml(l)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>`
    + `<div class="note">*Período de ${facts.period.start} a ${facts.period.end}, considerando ${escapeHtml(facts.month.covers)}.</div>`;
}

function allocationTable(facts) {
  const rows = facts.allocation.map((a) => `<tr><td>${escapeHtml(a.bucket)}</td><td class="${a.status !== 'dentro' ? 'hl' : ''}">`
    + `${escapeHtml(a.current)}</td><td>${escapeHtml(a.target_band)}</td></tr>`).join('');
  return `<h3>Sua alocação hoje e a faixa indicada para o perfil ${escapeHtml(facts.profile.label)}</h3>`
    + `<table><thead><tr><th>Classe</th><th>Hoje (% do patrimônio)</th><th>Faixa indicada</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function recommendationTable(facts) {
  const rows = facts.recommendations.flatMap((r) => r.moves.map((m, i) => `<tr><td class="hl">${i === 0 ? escapeHtml(r.title) : ''}</td>`
    + `<td>${escapeHtml(m.action)}</td><td>${escapeHtml(m.asset)}</td><td class="num">${escapeHtml(m.amount)}</td></tr>`)).join('');
  return `<table><thead><tr><th>Sugestão</th><th>Movimento</th><th>Ativo</th><th class="num">Valor</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function paragraph(text) {
  return `<p>${escapeHtml(String(text).trim())}</p>`;
}

const LETTER_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: #e6e6e6; color: #000; font-family: Calibri, "Segoe UI", Arial, sans-serif; }
.sheet { width: 210mm; min-height: 296mm; margin: 16px auto; background: #fff; padding: 12mm 18mm 9mm; display: flex;
  flex-direction: column; box-shadow: 0 2px 10px rgba(0,0,0,.18); break-after: page; }
.sheet:last-child { break-after: auto; }
@media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; } }
.band { display: flex; align-items: center; justify-content: space-between; background: #000; color: #fff; height: 15mm;
  padding: 0 12px; border-bottom: 3px solid ${XP_YELLOW}; }
.band img { height: 9.5mm; display: block; }
.band .title { text-align: right; font-weight: 700; font-size: 10pt; line-height: 1.25; }
.band .title small { display: block; font-weight: 400; color: #bfbfbf; font-size: 8pt; }
.date { text-align: right; color: #6b6b6b; font-size: 9pt; margin: 14px 0 8px; }
.recipient { font-size: 10.5pt; } .recipient span { display: block; color: #6b6b6b; font-size: 9pt; }
.subject { border-left: 4px solid ${XP_YELLOW}; padding-left: 10px; font-weight: 700; font-size: 12pt; margin: 12px 0; }
p { font-size: 10.5pt; line-height: 1.42; text-align: justify; margin: 0 0 9px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); background: #000; margin: 10px 0 3px; }
.kpi { padding: 7px 10px; } .kpi span { display: block; color: #bfbfbf; font-size: 7.5pt; }
.kpi strong { color: ${XP_YELLOW}; font-size: 12.5pt; white-space: nowrap; }
.note { color: #6b6b6b; font-size: 7.5pt; margin: 0 0 8px; }
.chart { margin: 6px 0 4px; }
h3 { font-size: 9.5pt; margin: 8px 0 4px; }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 4px; }
th { background: #000; color: #fff; text-align: left; padding: 4px 6px; font-weight: 700; }
td { border: 1px solid #cfcfcf; padding: 3px 6px; } .num { text-align: right; } td.hl { font-weight: 700; }
.obs { color: #6b6b6b; font-size: 8pt; margin: 4px 0 12px; }
.signature { font-size: 10.5pt; margin-top: 6px; } .signature small { display: block; color: #6b6b6b; font-size: 9pt; }
footer { margin-top: auto; color: #6b6b6b; font-size: 6.5pt; line-height: 1.35; text-align: justify; padding-top: 8px; }
`;

function renderLetterHtml(letter, facts, monthly, bench, notes, logoDataUri) {
  const footer = `<footer>${escapeHtml(disclaimerText(facts))}</footer>`;
  const first = `<section class="sheet">${band(logoDataUri)}<div class="date">${escapeHtml(facts.letter_date)}</div>`
    + `<div class="recipient"><strong>${escapeHtml(facts.client.full_name)}</strong><span>Conta ${escapeHtml(facts.client.account)} · Perfil ${escapeHtml(facts.profile.label)}</span></div>`
    + `<div class="subject">${escapeHtml(letter.subject)}</div>${paragraph(letter.greeting)}${paragraph(letter.performance)}`
    + `${kpiBoxes(facts)}<div class="chart">${barChartSvg(chartSeries(monthly, bench))}</div>${allocationTable(facts)}${footer}</section>`;
  const observations = notes.map((n) => `<div class="obs">Observação: ${escapeHtml(n)}</div>`).join('');
  const second = `<section class="sheet">${band(logoDataUri)}<div style="height:12px"></div>${paragraph(letter.outlook)}`
    + `${paragraph(letter.recommendations)}${recommendationTable(facts)}${observations}${paragraph(letter.closing)}`
    + `<div class="signature">Atenciosamente,<br><strong>${escapeHtml(facts.advisor.name)}</strong>`
    + `<small>Assessor de Investimentos XP · Código ${escapeHtml(facts.advisor.code)}</small></div>${footer}</section>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Carta mensal · ${escapeHtml(facts.client.full_name)}</title>`
    + `<style>${LETTER_CSS}</style></head><body>${first}${second}</body></html>`;
}
