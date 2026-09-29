/* Gera rivet/xp_monthly_letter.rivet-project: os 6 grafos de LLM (prompts e schemas em rivet/prompts e
   rivet/schemas), os grafos de loop extraction_attempt e letter_attempt e o grafo principal monthly_letter,
   que roda tudo dentro do Rivet e termina com a carta em HTML e PDF. O código dos nodes vem de rivet/code.
   Rode depois de editar qualquer prompt, schema ou código: node rivet/build.mjs. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { CODE_NODES, assembleCode } from './code/nodes.mjs';

const RIVET_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = join(RIVET_DIR, '..');
const SETTINGS = YAML.parse(readFileSync(join(REPO, 'config', 'settings.yaml'), 'utf8'));
const TARGET = join(REPO, SETTINGS.rivet.project);

const LLM_GRAPHS = [
  ['extract_portfolio', 'Transcribes the portfolio statement into validated JSON.', ['statement_text', 'corrections'], 'extraction', 0, 8000],
  ['extract_profile', 'Extracts the suitability constraints from the risk profile.', ['profile_text'], 'extraction', 0, 2000],
  ['macro_outlook', 'Monthly evidence-backed macro brief, shared by every client letter.', ['report_text'], 'writing', 0.1, 6000],
  ['advise', 'Chooses and explains the rule-sized recommendation candidates.',
    ['profile_json', 'allocation_json', 'candidates_json', 'macro_json'], 'writing', 0.2, 2500],
  ['write_letter', 'Writes the client letter (pt-BR) using only figures from FACTS.', ['facts_json', 'word_budget', 'corrections'], 'writing', 0.3, 4096],
  ['review_letter', 'Compliance review: flags letter statements that FACTS does not support.', ['facts_json', 'letter_json'], 'writing', 0, 2000],
];

class Graph {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.nodes = [];
  }

  add(id, type, title, x, y, data, width = 280) {
    const node = { id: `${this.name}__${id}`, type, title, x, y, width, data, connections: [] };
    this.nodes.push(node);
    return node;
  }

  link(from, fromPort, to, toPort) {
    from.connections.push(`${fromPort}->"${to.title}" ${to.id}/${toPort}`);
  }

  input(id, x, y, dataType = 'string', defaultValue = '') {
    return this.add(`in_${id}`, 'graphInput', `Input ${id}`, x, y, { id, dataType, defaultValue, useDefaultValueInput: false }, 240);
  }

  output(id, x, y, dataType = 'string') {
    return this.add(`out_${id}`, 'graphOutput', `Output ${id}`, x, y, { id, dataType }, 240);
  }

  code(name, x, y) {
    const spec = CODE_NODES[name];
    const allow = spec.allow;
    return this.add(name, 'code', spec.title, x, y, {
      code: assembleCode(name), inputNames: spec.inputs, outputNames: spec.outputs, allowFetch: Boolean(allow.fetch),
      allowRequire: Boolean(allow.require), allowRivet: false, allowProcess: Boolean(allow.process), allowConsole: false,
    }, 300);
  }

  subgraph(target, title, x, y) {
    return this.add(`sub_${target}`, 'subGraph', title, x, y, { graphId: graphId(target), useErrorOutput: false, useAsGraphPartialOutput: false });
  }

  loop(target, title, x, y, maxIterations) {
    return this.add(`loop_${target}`, 'loopUntil', title, x, y, {
      targetGraph: graphId(target), conditionType: 'inputEqual', inputToCheck: 'done', targetValue: 'true', maxIterations,
    }, 300);
  }

  serialize() {
    const nodes = Object.fromEntries(this.nodes.map((n) => [`[${n.id}]:${n.type} "${n.title}"`, {
      visualData: `${n.x}/${n.y}/${n.width}/1//`, data: n.data,
      ...(n.connections.length ? { outgoingConnections: [...n.connections].sort() } : {}),
    }]));
    return { metadata: { id: graphId(this.name), name: this.name, description: this.description }, nodes };
  }
}

function graphId(name) {
  return `graph_${name}`;
}

function prompt(name, part) {
  return readFileSync(join(RIVET_DIR, 'prompts', `${name}.${part}.md`), 'utf8').replace(/\r\n/g, '\n').trim();
}

function defaults(name) {
  const path = join(REPO, 'data', 'rivet_inputs', `${name}.json`);
  const values = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  return 'corrections' in values ? { ...values, corrections: '(none)' } : values;
}

function chatData(name, model, temperature, maxTokens) {
  return {
    model, useModelInput: true, temperature, useTemperatureInput: false, top_p: 1, useTopP: false, useTopPInput: false,
    useUseTopPInput: false, maxTokens, useMaxTokensInput: false, useStop: false, stop: '', useStopInput: false,
    responseFormat: 'json_schema', responseSchemaName: name, enableFunctionUse: false, parallelFunctionCalling: false, cache: false,
    useAsGraphPartialOutput: false, useServerTokenCalculation: true, outputUsage: true, additionalParameters: [],
    useAdditionalParametersInput: false,
  };
}

function llmGraph([name, description, inputs, modelKey, temperature, maxTokens]) {
  const g = new Graph(name, description);
  const model = SETTINGS.models[modelKey];
  const values = defaults(name);
  const userPrompt = g.add('prompt', 'prompt', 'User prompt', 420, 40,
    { type: 'user', useTypeInput: false, promptText: prompt(name, 'user'), enableFunctionCall: false }, 420);
  const system = g.add('system', 'text', 'System prompt', 420, -260, { text: prompt(name, 'system'), normalizeLineEndings: true }, 420);
  const schema = g.add('schema', 'object', 'Response schema', 420, 420,
    { jsonTemplate: JSON.stringify(JSON.parse(readFileSync(join(RIVET_DIR, 'schemas', `${name}.json`), 'utf8')), null, 2) }, 420);
  const chat = g.add('chat', 'chat', 'Chat', 960, 40, chatData(name, model, temperature, maxTokens), 260);
  const json = g.add('json', 'extractJson', 'Extract JSON', 1300, 40, {}, 250);
  inputs.forEach((id, index) => g.link(g.input(id, 0, index * 220, 'string', values[id] || ''), 'data', userPrompt, id));
  g.link(g.input('model', 0, inputs.length * 220, 'string', model), 'data', chat, 'model');
  g.link(system, 'output', chat, 'systemPrompt');
  g.link(userPrompt, 'output', chat, 'prompt');
  g.link(schema, 'output', chat, 'responseSchema');
  g.link(chat, 'response', json, 'input');
  g.link(json, 'output', g.output('result', 1620, 0, 'object'), 'value');
  g.link(chat, 'usage', g.output('usage', 1620, 240, 'object'), 'value');
  return g;
}

function extractionAttempt() {
  const g = new Graph('extraction_attempt', 'One transcription of the statement plus reconciliation; looped until it adds up.');
  const text = g.input('statement_text', 0, 0);
  const corrections = g.input('corrections', 0, 200);
  const model = g.input('model', 0, 400);
  const log = g.input('usage_log', 0, 600);
  const extract = g.subgraph('extract_portfolio', 'LLM · extract_portfolio', 420, 100);
  const check = g.code('reconcile', 900, 100);
  g.link(text, 'data', extract, 'statement_text');
  g.link(corrections, 'data', extract, 'corrections');
  g.link(model, 'data', extract, 'model');
  g.link(extract, 'result', check, 'extraction');
  g.link(extract, 'usage', check, 'usage');
  g.link(log, 'data', check, 'usage_log');
  g.link(model, 'data', check, 'model');
  [['statement', 'object'], ['checks', 'object'], ['done', 'string'], ['corrections', 'string'], ['usage_log', 'string']]
    .forEach(([id, type], i) => g.link(check, id, g.output(id, 1400, i * 160, type), 'value'));
  g.link(text, 'data', g.output('statement_text', 1400, 820), 'value');
  g.link(model, 'data', g.output('model', 1400, 980), 'value');
  return g;
}

function letterAttempt() {
  const g = new Graph('letter_attempt', 'One version of the letter: write, fact-check, review and decide; looped up to 3 times.');
  const facts = g.input('facts_json', 0, 0);
  const budget = g.input('word_budget', 0, 200);
  const corrections = g.input('corrections', 0, 400);
  const model = g.input('model', 0, 600);
  const log = g.input('usage_log', 0, 800);
  const write = g.subgraph('write_letter', 'LLM · write_letter', 420, 100);
  const numbers = g.code('check_numbers', 860, 60);
  const review = g.subgraph('review_letter', 'LLM · review_letter', 1300, 100);
  const decide = g.code('decide_letter', 1740, 100);
  g.link(facts, 'data', write, 'facts_json');
  g.link(budget, 'data', write, 'word_budget');
  g.link(corrections, 'data', write, 'corrections');
  g.link(model, 'data', write, 'model');
  g.link(write, 'result', numbers, 'letter');
  g.link(facts, 'data', numbers, 'facts_json');
  g.link(facts, 'data', review, 'facts_json');
  g.link(numbers, 'letter_json', review, 'letter_json');
  g.link(model, 'data', review, 'model');
  g.link(write, 'result', decide, 'letter');
  g.link(numbers, 'factcheck', decide, 'factcheck');
  g.link(review, 'result', decide, 'review');
  g.link(budget, 'data', decide, 'word_budget');
  g.link(write, 'usage', decide, 'write_usage');
  g.link(review, 'usage', decide, 'review_usage');
  g.link(log, 'data', decide, 'usage_log');
  g.link(model, 'data', decide, 'model');
  [['letter', 'object'], ['review', 'object'], ['done', 'string'], ['corrections', 'string'], ['usage_log', 'string']]
    .forEach(([id, type], i) => g.link(decide, id, g.output(id, 2200, i * 160, type), 'value'));
  g.link(numbers, 'factcheck', g.output('factcheck', 2200, 820, 'object'), 'value');
  g.link(facts, 'data', g.output('facts_json', 2200, 980), 'value');
  g.link(budget, 'data', g.output('word_budget', 2200, 1140), 'value');
  g.link(model, 'data', g.output('model', 2200, 1300), 'value');
  return g;
}

function monthlyLetter() {
  const g = new Graph('monthly_letter', 'Runs the whole monthly letter inside Rivet: read, extract, check, compute, advise, write, review, publish.');
  const repo = g.input('repo_dir', 0, 300, 'string', REPO);
  const load = g.code('load_inputs', 360, 300);
  const market = g.code('market_data', 800, 700);
  const extraction = g.loop('extraction_attempt', 'Loop · transcrever até reconciliar (máx. 2)', 800, 0, 2);
  const profile = g.subgraph('extract_profile', 'LLM · extract_profile', 800, 380);
  const macro = g.subgraph('macro_outlook', 'LLM · macro_outlook', 800, 1000);
  const ground = g.code('ground_macro', 1240, 1000);
  const analyze = g.code('analyze', 1680, 300);
  const advise = g.subgraph('advise', 'LLM · advise', 2120, 300);
  const facts = g.code('build_facts', 2560, 300);
  const letter = g.loop('letter_attempt', 'Loop · escrever, checar e revisar (máx. 3)', 3000, 300, 3);
  const render = g.code('render_letter', 3440, 100);
  const publish = g.code('publish', 3880, 300);
  g.link(repo, 'data', load, 'repo_dir');
  g.link(load, 'context', market, 'context');
  g.link(load, 'statement_text', extraction, 'statement_text');
  g.link(load, 'no_corrections', extraction, 'corrections');
  g.link(load, 'model_extraction', extraction, 'model');
  g.link(load, 'empty_log', extraction, 'usage_log');
  g.link(load, 'profile_text', profile, 'profile_text');
  g.link(load, 'model_extraction', profile, 'model');
  g.link(load, 'report_text', macro, 'report_text');
  g.link(load, 'model_writing', macro, 'model');
  g.link(macro, 'result', ground, 'outlook');
  g.link(load, 'report_text', ground, 'report_text');
  g.link(extraction, 'statement', analyze, 'statement');
  g.link(extraction, 'done', analyze, 'extraction_done');
  g.link(extraction, 'checks', analyze, 'checks');
  g.link(profile, 'result', analyze, 'profile');
  g.link(ground, 'macro', analyze, 'macro');
  g.link(load, 'context', analyze, 'context');
  g.link(market, 'market', analyze, 'market');
  ['profile_json', 'allocation_json', 'candidates_json'].forEach((port) => g.link(analyze, port, advise, port));
  g.link(ground, 'macro_json', advise, 'macro_json');
  g.link(load, 'model_writing', advise, 'model');
  g.link(analyze, 'analysis', facts, 'analysis');
  g.link(advise, 'result', facts, 'advice');
  g.link(ground, 'macro', facts, 'macro');
  g.link(facts, 'facts_json', letter, 'facts_json');
  g.link(load, 'word_budget', letter, 'word_budget');
  g.link(load, 'no_corrections', letter, 'corrections');
  g.link(load, 'model_writing', letter, 'model');
  g.link(load, 'empty_log', letter, 'usage_log');
  g.link(letter, 'letter', render, 'letter');
  g.link(facts, 'facts', render, 'facts');
  g.link(analyze, 'analysis', render, 'analysis');
  g.link(load, 'context', render, 'context');
  const publishInputs = [
    [render, 'html', 'html'], [analyze, 'analysis', 'analysis'], [facts, 'facts', 'facts'], [letter, 'letter', 'letter'],
    [letter, 'factcheck', 'factcheck'], [letter, 'review', 'review'], [letter, 'done', 'letter_done'],
    [letter, 'iteration', 'letter_iterations'], [extraction, 'iteration', 'extraction_iterations'], [ground, 'grounding', 'grounding'],
    [ground, 'macro', 'macro'], [facts, 'recommendations', 'recommendations'], [extraction, 'usage_log', 'extraction_log'],
    [letter, 'usage_log', 'letter_log'], [profile, 'usage', 'profile_usage'], [macro, 'usage', 'macro_usage'],
    [advise, 'usage', 'advise_usage'], [load, 'context', 'context'],
  ];
  publishInputs.forEach(([node, port, target]) => g.link(node, port, publish, target));
  g.link(publish, 'pdf_path', g.output('pdf_path', 4320, 200), 'value');
  g.link(publish, 'status', g.output('status', 4320, 400), 'value');
  g.link(publish, 'brief', g.output('brief', 4320, 600), 'value');
  return g;
}

function build() {
  const graphs = [...LLM_GRAPHS.map(llmGraph), extractionAttempt(), letterAttempt(), monthlyLetter()];
  const project = {
    version: 4,
    data: {
      attachedData: { trivet: { testSuites: [], version: 1 } },
      graphs: Object.fromEntries(graphs.map((g) => [graphId(g.name), g.serialize()])),
      metadata: {
        id: 'xp-monthly-letter-rivet-native', title: 'XP Monthly Letter (Rivet-native)',
        description: 'The whole XP monthly letter runs inside Rivet: open monthly_letter, select the Node executor and run.',
        mainGraphId: graphId('monthly_letter'),
      },
      plugins: [],
      references: [],
    },
  };
  writeFileSync(TARGET, YAML.stringify(project, { lineWidth: 0 }), 'utf8');
  return TARGET;
}

console.log(build());
