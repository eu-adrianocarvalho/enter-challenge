/* Lê o enter_challenge.rivet-project e monta os dados que o visualizador do site desenha: cada node na
   posição do app do Rivet, com resumo, conteúdo completo e ligações. Nos Code nodes mostra o arquivo de
   src/code/ de onde o código veio; nos subgrafos e loops, qual grafo eles chamam. No grafo original da v1
   marca em vermelho as ligações trocadas e os nodes com problema, detectados a partir do conteúdo. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

import { CODE_NODES, source } from '../../src/code/nodes.mjs';

const NODE_KEY = /^\[([^\]]+)\]:(\S+) "(.*)"$/;
const CONNECTION = /^(.+?)->"(.+)"\s+([^/\s]+)\/(.+)$/;
const DETAIL_LIMIT = 6000;
const SUMMARY_TOPICS = { Portfolio: 'portfolio_results', 'Risk Profile': 'risk_profile', Macroeconomic: 'macro_outlook' };
const TOPIC_LABELS = { portfolio_results: 'carteira', risk_profile: 'perfil', macro_outlook: 'macro' };

export const PROJECT = 'enter_challenge.rivet-project';

function firstLine(text) {
  const line = (text || '').split('\n').map((l) => l.replace(/^[#\s]+/, '').trim()).find(Boolean) || '';
  return line.length <= 70 ? line : `${line.slice(0, 67)}…`;
}

function truncate(text) {
  return text.length <= DETAIL_LIMIT ? text : `${text.slice(0, DETAIL_LIMIT)}\n\n[cortado no site; ver o arquivo completo]`;
}

function codeName(nodeId) {
  return nodeId.split('__').pop();
}

function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function summary(type, data, nodeId, names) {
  const kinds = {
    graphInput: () => `entrada ${data.id} (${data.dataType})`,
    graphOutput: () => `saída ${data.id} (${data.dataType})`,
    text: () => firstLine(data.text),
    prompt: () => firstLine(data.promptText),
    chat: () => `${data.useModelInput ? 'modelo pela entrada' : data.model} · temp ${data.temperature} · max ${data.maxTokens}`
      + (data.responseFormat === 'json_schema' ? ' · JSON schema' : ''),
    object: () => 'JSON schema da resposta',
    extractJson: () => 'texto → objeto JSON',
    readFile: () => (data.usePathInput ? 'lê o arquivo do caminho recebido' : String(data.path)),
    code: () => `JavaScript · src/code/${codeName(nodeId)}.js`,
    subGraph: () => `roda ${names[data.graphId] ?? data.graphId}`,
    loopUntil: () => `repete ${names[data.targetGraph] ?? data.targetGraph} até done = true (máx. ${data.maxIterations})`,
  };
  return (kinds[type] || (() => type))();
}

function codeDetail(nodeId, data) {
  const spec = CODE_NODES[codeName(nodeId)];
  if (!spec) return data.code;
  const allowed = Object.keys(spec.allow).join(', ') || 'nenhuma';
  return `// src/code/${codeName(nodeId)}.js\n// bibliotecas coladas antes: ${spec.libs.map((l) => `lib/${l}.js`).join(', ')}\n`
    + `// permissões do executor: ${allowed}\n\n${source(`${codeName(nodeId)}.js`)}`;
}

function detail(type, data, nodeId) {
  const kinds = {
    text: () => data.text || '',
    prompt: () => data.promptText || '',
    object: () => prettyJson(data.jsonTemplate || ''),
    chat: () => ['model', 'useModelInput', 'temperature', 'maxTokens', 'responseFormat', 'responseSchemaName', 'outputUsage']
      .filter((key) => key in data).map((key) => `${key}: ${data[key]}`).join('\n'),
    graphInput: () => `id: ${data.id}\ntipo: ${data.dataType}\n\nvalor padrão:\n${data.defaultValue ?? ''}`,
    code: () => codeDetail(nodeId, data),
  };
  return (kinds[type] || (() => YAML.stringify(data)))();
}

function v1Flags(type, data, outgoing) {
  const text = JSON.stringify(data);
  return [
    text.includes('C:\\\\Users\\\\') && 'Caminho absoluto de outra máquina (C:\\Users\\blope\\...)',
    type === 'readFile' && data.errorOnMissingFile === false && 'errorOnMissingFile: false — arquivo ausente vira texto vazio, sem erro',
    text.includes('Prezado João') && 'Cliente fixo no prompt: "Prezado João"',
    type === 'chat' && outgoing === 0 && 'Nenhuma saída conectada: o resultado não sai do grafo',
  ].filter(Boolean);
}

function calledGraph(type, data) {
  const kinds = { subGraph: data.graphId, loopUntil: data.targetGraph };
  return kinds[type] ?? null;
}

function parseNodes(rawNodes, version, names) {
  const nodes = [];
  const edges = [];
  for (const [key, body] of Object.entries(rawNodes)) {
    const [, id, type, title] = key.match(NODE_KEY);
    const [x, y, width] = (body.visualData || '0/0/260').split('/');
    const data = body.data || {};
    const connections = body.outgoingConnections || [];
    nodes.push({
      id, type, title, x: Number(x), y: Number(y), w: Number(width) || 260,
      summary: summary(type, data, id, names), detail: truncate(detail(type, data, id)),
      flags: version === 'v1' ? v1Flags(type, data, connections.length) : [],
      target: calledGraph(type, data), text: data.promptText || '',
    });
    for (const connection of connections) {
      const [, fromPort, , to, toPort] = connection.match(CONNECTION);
      edges.push({ from: id, fromPort, to, toPort, flag: '' });
    }
  }
  return { nodes, edges };
}

function expectedPort(promptText) {
  const header = firstLine(promptText);
  return Object.entries(SUMMARY_TOPICS).find(([word]) => header.includes(word))?.[1] ?? null;
}

function flagSwappedInputs(nodes, edges) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const feedingPrompt = Object.fromEntries(edges
    .filter((e) => e.toPort === 'prompt' && byId[e.from].type === 'prompt').map((e) => [e.to, byId[e.from]]));
  for (const edge of edges) {
    const sourceNode = feedingPrompt[edge.from];
    const expected = sourceNode && TOPIC_LABELS[edge.toPort] ? expectedPort(sourceNode.text) : null;
    if (expected && expected !== edge.toPort) {
      edge.flag = `resumo de ${TOPIC_LABELS[expected]} entra em ${edge.toPort}`;
      byId[edge.to].flags.push(`Entrada ${edge.toPort} recebe o resumo de ${TOPIC_LABELS[expected]}`);
    }
  }
}

function withPorts(nodes, edges) {
  return nodes.map(({ text, ...node }) => ({
    ...node,
    inputs: [...new Set(edges.filter((e) => e.to === node.id).map((e) => e.toPort))],
    outputs: [...new Set(edges.filter((e) => e.from === node.id).map((e) => e.fromPort))],
  }));
}

function versionOf(graphId) {
  return graphId.startsWith('graph_') ? 'v2' : 'v1';
}

export function viewerData(repo) {
  const project = YAML.parse(readFileSync(join(repo, PROJECT), 'utf8'));
  const mainId = project.data.metadata.mainGraphId;
  const graphs = Object.entries(project.data.graphs);
  const names = Object.fromEntries(graphs.map(([id, graph]) => [id, graph.metadata.name]));
  const rank = ([id]) => (id === mainId ? 0 : versionOf(id) === 'v2' ? 1 : 2);
  return [...graphs].sort((a, b) => rank(a) - rank(b)).map(([id, graph]) => {
    const version = versionOf(id);
    const { nodes, edges } = parseNodes(graph.nodes, version, names);
    if (version === 'v1') flagSwappedInputs(nodes, edges);
    return {
      key: id, version, name: graph.metadata.name, main: id === mainId, description: graph.metadata.description || '',
      file: PROJECT, nodes: withPorts(nodes, edges), edges,
    };
  });
}
