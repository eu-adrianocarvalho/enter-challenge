/* Escreve o brief do assessor em Markdown: status da carta, resultado de cada checagem, alertas de dados,
   rentabilidade por ativo, alocação vs. perfil, recomendações com as citações do research que as
   sustentam, estimativa de IR, custo por chamada ao LLM e arquivos gerados. É o documento que o assessor
   lê e aprova antes de enviar a carta. Depende de format.js, facts.js e suitability.js. */

const SEVERITY_ORDER = { alta: 0, 'média': 1, info: 2 };

function mark(ok) {
  return ok ? 'OK' : 'FALHOU';
}

function checksSection(b) {
  const failed = b.checks.filter((c) => !c.passed);
  const lines = [
    '## 1. Checagens automáticas',
    `- Reconciliação do extrato extraído pelo LLM: ${b.checks.length - failed.length}/${b.checks.length} (${mark(!failed.length)}; ${b.extractionAttempts} transcrição(ões))`,
    `- Citações do relatório macro conferidas no texto original: ${b.grounding.kept} mantidas, ${b.grounding.dropped.length} descartadas ${b.grounding.dropped.length ? JSON.stringify(b.grounding.dropped) : ''}`,
    `- Fact-check da carta: ${b.factcheck.checked} números conferidos, ${b.factcheck.unsupported.length} sem fonte (${mark(b.factcheck.passed)}; ${b.letterAttempts} versão(ões) geradas)`,
    `- Revisão de fidelidade (LLM revisor): ${b.reviewIssues.length} apontamento(s) grave(s) na versão final (${mark(!b.reviewIssues.length)})`,
    `- Páginas do PDF: ${b.pages == null ? 'PDF não gerado' : b.pages}`,
  ];
  lines.push(...failed.map((c) => `  - Reconciliação falhou: ${c.name} (${c.detail})`));
  lines.push(...b.factcheck.unsupported.map((f) => `  - Número sem fonte na carta: ${f}`));
  lines.push(...b.reviewIssues.map((i) => `  - ${i.field}: "${i.excerpt}" (${i.problem})`));
  return lines;
}

function flagsSection(flags) {
  const rows = [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map((f) => `| ${f.severity} | ${f.code} | ${f.message} |`);
  return ['## 2. Alertas de dados', '| Severidade | Código | Alerta |', '|---|---|---|', ...rows];
}

function returnsSection(monthly) {
  const rows = [...monthly.assets].sort((a, b) => b.pnl - a.pnl).map((a) =>
    `| ${a.label} | ${CLASS_LABELS[a.assetClass]} | ${pct(a.returnPct, 2, true)} | ${brl(a.pnl, true)} | ${a.source} |`);
  return ['## 3. Rentabilidade no período',
    `Carteira coberta (${pct(monthly.coveragePct, 1)} do investido): ${pct(monthly.total.returnPct, 2, true)}, ${brl(monthly.total.pnl, true)}.`,
    '', '| Ativo | Classe | Retorno | Resultado | Fonte |', '|---|---|---|---|---|', ...rows];
}

function allocationSection(allocation) {
  const rows = Object.values(allocation).map((a) =>
    `| ${BUCKET_LABELS[a.bucket]} | ${brl(a.value)} (${pct(a.pct, 1)}) | ${a.band.min}% a ${a.band.max}% | ${a.status} |`);
  return ['## 4. Alocação vs. perfil', '| Bloco | Atual | Banda do perfil | Situação |', '|---|---|---|---|', ...rows];
}

function evidenceLines(macro, ids) {
  const quotes = Object.fromEntries(['projections', 'themes', 'risks'].flatMap((s) => macro[s].map((i) => [i.id, i.quote])));
  const readings = Object.fromEntries(macro.implications.map((i) => [i.id, i]));
  return ids.map((id) => {
    if (quotes[id]) return `  - ${id}, citação do relatório: "${quotes[id]}"`;
    if (readings[id]) return `  - ${id}, leitura do modelo apoiada em ${readings[id].evidence_ids.join(', ')}: ${readings[id].summary_pt}`;
    return null;
  }).filter(Boolean);
}

function recommendationsSection(b) {
  const lines = ['## 5. Recomendações propostas (aprovar antes do envio)'];
  for (const rec of b.recommendations) {
    lines.push('', `**${rec.priority}. ${rec.title}**. ${rec.rationale}`);
    lines.push(...rec.candidates.map((c) => `- ${c.action[0].toUpperCase()}${c.action.slice(1)} ${c.asset}: ${brl(c.amount)}. Regra: ${c.rule}`));
    lines.push('- Evidências do research:', ...evidenceLines(b.macro, rec.evidenceIds));
  }
  const chosen = new Set(b.recommendations.flatMap((r) => r.candidates.map((c) => c.id)));
  const skipped = b.candidates.filter((c) => !chosen.has(c.id));
  if (skipped.length) lines.push(`- Candidatos não usados na carta: ${skipped.map((c) => `${c.action} ${c.asset} (${brl(c.amount)})`).join(', ')}`);
  if (b.tax) lines.push(`- IR: ${b.tax.summary}`);
  lines.push(...b.advisorNotes.map((n) => `- Nota do modelo: ${n}`));
  return lines;
}

function costSection(runs) {
  const rows = runs.map((r) => `| ${r.graph} | ${r.model} | ${r.prompt_tokens}/${r.completion_tokens} | ${r.cost_usd.toFixed(4)} |`);
  const total = runs.reduce((s, r) => s + r.cost_usd, 0);
  return ['## 6. Custo das chamadas ao LLM', '| Grafo | Modelo | Tokens (in/out) | Custo (US$) |', '|---|---|---|---|', ...rows,
    `| **Total** | | | **${total.toFixed(4)}** |`];
}

function renderBrief(b) {
  const s = b.statement;
  return [
    `# Brief do assessor: ${s.clientName} (conta ${s.account})`, '', `**Status: ${b.status}**`, '',
    `Assessor: ${s.advisorName} (${s.advisorCode}) · Extrato de ${dateBr(s.statementDate)} · Gerado pelo grafo monthly_letter do Rivet`,
    '', ...checksSection(b), '', ...flagsSection(b.flags), '', ...returnsSection(b.monthly), '', ...allocationSection(b.allocation), '',
    ...recommendationsSection(b), '', ...costSection(b.runs), '', '## 7. Arquivos gerados', ...b.files.map((f) => `- ${f}`), '',
  ].join('\n');
}
