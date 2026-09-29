/* Executa um node de código do Rivet fora do app, do mesmo jeito que o executor Node do Rivet faz: monta o
   texto com assembleCode(), cria uma AsyncFunction com os mesmos parâmetros (inputs, process, fetch,
   graphInputs, context; sem require, que o app desktop não suporta) e converte o formato { type, value }. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleCode } from '../code/nodes.mjs';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AsyncFunction = (async () => {}).constructor;

export function fixture(name) {
  return JSON.parse(readFileSync(join(REPO, 'src', 'tests', 'fixtures', name), 'utf8'));
}

function typedInputs(plain) {
  return Object.fromEntries(Object.entries(plain).map(([name, value]) => [name, { type: typeof value === 'string' ? 'string' : 'object', value }]));
}

export async function runNode(name, plainInputs, { fetchImpl = fetch } = {}) {
  const run = new AsyncFunction('inputs', 'process', 'fetch', 'graphInputs', 'context', assembleCode(name));
  const outputs = await run(typedInputs(plainInputs), process, fetchImpl, {}, {});
  return Object.fromEntries(Object.entries(outputs).map(([key, port]) => [key, port.value]));
}

export async function offlineFetch() {
  throw new Error('sem rede nos testes');
}
