/* Executa um node de código do Rivet fora do app, do mesmo jeito que o executor Node do Rivet faz: monta o
   texto com assembleCode(), cria uma AsyncFunction com os mesmos parâmetros (inputs, require, process,
   fetch, console, graphInputs, context) e converte entradas e saídas do formato tipado { type, value }. */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleCode } from '../code/nodes.mjs';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AsyncFunction = (async () => {}).constructor;
const require = createRequire(import.meta.url);

export function fixture(name) {
  return JSON.parse(readFileSync(join(REPO, 'rivet', 'tests', 'fixtures', name), 'utf8'));
}

function typedInputs(plain) {
  return Object.fromEntries(Object.entries(plain).map(([name, value]) => [name, { type: typeof value === 'string' ? 'string' : 'object', value }]));
}

export async function runNode(name, plainInputs, { fetchImpl = fetch } = {}) {
  const run = new AsyncFunction('inputs', 'require', 'process', 'fetch', 'console', 'graphInputs', 'context', assembleCode(name));
  const outputs = await run(typedInputs(plainInputs), require, process, fetchImpl, console, {}, {});
  return Object.fromEntries(Object.entries(outputs).map(([key, port]) => [key, port.value]));
}

export async function offlineFetch() {
  throw new Error('sem rede nos testes');
}
