/* Catálogo dos nodes de código do Rivet: para cada node, as bibliotecas de src/code/lib que entram antes
   do corpo, as portas de entrada e saída e as permissões do executor Node (process, fetch).
   assembleCode() monta o texto exato que vai dentro do node; o gerador do projeto (src/build.mjs) e os
   testes (src/tests) usam a mesma função, então o código testado é o código que roda no Rivet. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_DIR = dirname(fileURLToPath(import.meta.url));

export const CODE_NODES = {
  load_inputs: {
    title: 'Code: Load Inputs', libs: ['io', 'modules', 'format', 'pdf'], inputs: ['repo_dir'],
    outputs: ['statement_text', 'profile_text', 'report_text', 'context', 'model_extraction', 'model_writing', 'word_budget',
      'no_corrections', 'empty_log'],
    allow: { process: true },
  },
  market_data: {
    title: 'Code: Market Data (CVM, BCB, Yahoo)', libs: ['io', 'modules', 'format', 'market'], inputs: ['context'], outputs: ['market'],
    allow: { fetch: true },
  },
  reconcile: {
    title: 'Code: Reconcile Statement', libs: ['io', 'format', 'portfolio'], inputs: ['extraction', 'usage', 'usage_log', 'model'],
    outputs: ['statement', 'checks', 'done', 'corrections', 'usage_log'], allow: {},
  },
  ground_macro: {
    title: 'Code: Check Macro Quotes', libs: ['io', 'factcheck', 'grounding'], inputs: ['outlook', 'report_text'],
    outputs: ['macro', 'macro_json', 'grounding'], allow: {},
  },
  analyze: {
    title: 'Code: Analyze Portfolio', libs: ['io', 'format', 'portfolio', 'returns', 'suitability', 'quality'],
    inputs: ['statement', 'extraction_done', 'checks', 'profile', 'macro', 'context', 'market'],
    outputs: ['analysis', 'profile_json', 'allocation_json', 'candidates_json'], allow: {},
  },
  build_facts: {
    title: 'Code: Build FACTS', libs: ['io', 'format', 'portfolio', 'returns', 'suitability', 'facts'], inputs: ['analysis', 'advice', 'macro'],
    outputs: ['facts', 'facts_json', 'recommendations'], allow: {},
  },
  check_numbers: {
    title: 'Code: Fact-check Figures', libs: ['io', 'factcheck'], inputs: ['letter', 'facts_json'], outputs: ['factcheck', 'letter_json'],
    allow: {},
  },
  decide_letter: {
    title: 'Code: Decide Letter Version', libs: ['io', 'factcheck'],
    inputs: ['letter', 'factcheck', 'review', 'word_budget', 'write_usage', 'review_usage', 'usage_log', 'model'],
    outputs: ['letter', 'review', 'done', 'corrections', 'usage_log'], allow: {},
  },
  render_letter: {
    title: 'Code: Render Letter (HTML)', libs: ['io', 'format', 'returns', 'suitability', 'facts', 'letter_html'],
    inputs: ['letter', 'facts', 'analysis', 'context'], outputs: ['html'], allow: {},
  },
  publish: {
    title: 'Code: Publish (PDF, Brief, Log)', libs: ['io', 'modules', 'format', 'portfolio', 'suitability', 'facts', 'brief'],
    inputs: ['html', 'analysis', 'facts', 'letter', 'factcheck', 'review', 'letter_done', 'letter_iterations', 'extraction_iterations',
      'grounding', 'macro', 'recommendations', 'extraction_log', 'letter_log', 'profile_usage', 'macro_usage', 'advise_usage', 'context'],
    outputs: ['pdf_path', 'status', 'brief', 'pages'], allow: { process: true },
  },
};

export function source(relative) {
  return readFileSync(join(CODE_DIR, relative), 'utf8').replace(/\r\n/g, '\n').trim();
}

export function assembleCode(name) {
  const spec = CODE_NODES[name];
  return [...spec.libs.map((lib) => source(`lib/${lib}.js`)), source(`${name}.js`)].join('\n\n');
}
