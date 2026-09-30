/* Testes dos Code nodes do Main Graph: Enter Challenge, sem chamar o LLM: usam respostas reais já guardadas
   (perfil, macro e advise) e comparam com a versão Python do primeiro commit. Conferem a leitura do PDF, a
   reconciliação (e a detecção de um subtotal trocado), a rentabilidade (+2,51% / +R$ 6.650,04), os
   candidatos (R$ 40 mil + 40 mil + 27 mil), o IR, os 11 alertas, o FACTS idêntico ao Python e o fact-check. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REPO, fixture, offlineFetch, runNode } from './harness.mjs';

const loaded = await runNode('load_inputs', { repo_dir: REPO });
const market = (await runNode('market_data', { context: loaded.context }, { fetchImpl: offlineFetch })).market;
const extraction = fixture('albert_statement.json');
const reconciled = await runNode('reconcile', { extraction, usage: {}, usage_log: '[]', model: 'gpt-4.1' });
const grounded = await runNode('ground_macro', { outlook: fixture('llm_macro_outlook.json'), report_text: loaded.report_text });
const analyzed = await runNode('analyze', {
  statement: reconciled.statement, extraction_done: reconciled.done, checks: reconciled.checks, profile: fixture('llm_profile.json'),
  macro: grounded.macro, context: loaded.context, market,
});
const built = await runNode('build_facts', { analysis: analyzed.analysis, advice: fixture('llm_advise.json'), macro: grounded.macro });
const python = fixture('python_facts_and_letter.json');

test('PDF do extrato vira uma linha por posição', () => {
  assert.match(loaded.statement_text, /LREN3 R\$27,812\.04 8\.91% -41,7%/);
  assert.match(loaded.statement_text, /22\/04\/2021 R\$ 29,05 R\$ 16,94 1642/);
  assert.equal(loaded.model_extraction, 'gpt-4.1');
});

test('extrato do gabarito reconcilia, e um subtotal trocado é pego', async () => {
  assert.equal(reconciled.done, 'true');
  assert.equal(reconciled.checks.length, 28);
  const broken = structuredClone(extraction);
  broken.class_totals[0].subtotal = 60131.79;
  const result = await runNode('reconcile', { extraction: broken, usage: {}, usage_log: '[]', model: 'gpt-4.1' });
  assert.equal(result.done, 'false');
  assert.match(result.corrections, /posições de stock = subtotal/);
});

test('rentabilidade do período igual à versão Python', () => {
  const { monthly } = analyzed.analysis;
  assert.equal(monthly.byClass.stock.pnl.toFixed(2), '1925.97');
  assert.equal(monthly.total.returnPct.toFixed(2), '2.51');
  assert.equal(monthly.total.pnl.toFixed(2), '6650.04');
  assert.equal(analyzed.analysis.benchmarks.cdi_pct.toFixed(2), '1.00');
});

test('candidatos, IR e alertas iguais à versão Python', () => {
  const amounts = Object.fromEntries(analyzed.analysis.candidates.map((c) => [c.id, Math.round(c.amount)]));
  assert.equal(amounts.reinvest_post_fixed, 40000);
  assert.equal(amounts.reinvest_inflation_linked, 40000);
  assert.equal(amounts.add_multimarket, 27000);
  assert.equal(analyzed.analysis.tax.net.toFixed(2), '-13345.11');
  assert.equal(analyzed.analysis.flags.length, 11);
});

test('citações do macro conferidas como na versão Python', () => {
  assert.equal(grounded.grounding.kept, 23);
  assert.deepEqual(grounded.grounding.dropped, ['T6']);
});

test('FACTS idêntico ao gerado pela versão Python', () => {
  assert.deepEqual(built.facts, python.facts);
});

test('fact-check aprova a carta final e pega número inventado', async () => {
  const ok = await runNode('check_numbers', { letter: python.letter, facts_json: built.facts_json });
  assert.equal(ok.factcheck.passed, true);
  const invented = { ...python.letter, performance: `${python.letter.performance} O retorno ficou 0,2 p.p. abaixo do benchmark.` };
  const bad = await runNode('check_numbers', { letter: invented, facts_json: built.facts_json });
  assert.deepEqual(bad.factcheck.unsupported, ['0,2 p.p.']);
});

test('carta em HTML traz a identidade da XP e os números', async () => {
  const { html } = await runNode('render_letter', { letter: python.letter, facts: built.facts, analysis: analyzed.analysis, context: loaded.context });
  assert.match(html, /data:image\/jpeg;base64,/);
  assert.match(html, /R\$ 386\.858,82/);
  assert.match(html, /Observação: O CDB BANCO C6/);
  assert.equal((html.match(/class="sheet"/g) || []).length, 2);
});
