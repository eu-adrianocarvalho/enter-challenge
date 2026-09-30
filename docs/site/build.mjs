/* Gera docs/index.html, o site de entrega do desafio, no visual da Enter (getenter.ai): quatro tópicos
   (Apresentação, O trabalho, Uso, Arquivos), seções vindas de docs/0*.md, a carta da v1 ao lado da v2, os
   números da última execução lidos de Output/ e a prévia de cada arquivo. O layout vem de layout.mjs e a
   página abre sozinha. Rode depois de gerar a carta: npm run docs. */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import YAML from 'yaml';

import { AUTHOR, REPO_URL, renderSite } from './layout.mjs';
import { escapeHtml, renderMarkdown } from './markdown.mjs';

const SITE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(SITE, '..');
const REPO = join(DOCS, '..');
const SETTINGS = YAML.parse(readFileSync(join(REPO, 'config', 'settings.yaml'), 'utf8'));
const OUTPUT_DIR = SETTINGS.paths.output_dir;
const TEXT_PREVIEW_LIMIT = 60000;
const CSV_PREVIEW_ROWS = 60;

const TOPICS = [
  { id: 'apresentacao', label: 'Apresentação', summary: 'O que foi entregue, os números e a carta da v1 ao lado da v2.' },
  { id: 'trabalho', label: 'O trabalho', summary: 'O diagnóstico da v1, as melhorias, a arquitetura, os dados externos e as travas.' },
  { id: 'uso', label: 'Uso', summary: 'Como instalar, rodar pelo app do Rivet ou pelo terminal, e adaptar.' },
  { id: 'arquivos', label: 'Arquivos', summary: 'Prévia e download de tudo o que entrou e saiu do sistema.' },
];

const SECTIONS = [
  { source: '01_visao_geral.md', anchor: 'visao-geral', nav: 'Visão geral', topic: 'apresentacao' },
  { source: '', anchor: 'carta', nav: 'A carta e o brief', topic: 'apresentacao' },
  { source: '02_diagnostico_v1.md', anchor: 'diagnostico', nav: 'Diagnóstico da v1', topic: 'trabalho' },
  { source: '03_melhorias_implementadas.md', anchor: 'melhorias', nav: 'Melhorias implementadas', topic: 'trabalho' },
  { source: '04_arquitetura_e_codigo.md', anchor: 'arquitetura', nav: 'Arquitetura e código', topic: 'trabalho' },
  { source: '05_dados_externos.md', anchor: 'dados-externos', nav: 'Dados externos', topic: 'trabalho' },
  { source: '06_qualidade_e_travas.md', anchor: 'qualidade', nav: 'Qualidade e travas', topic: 'trabalho' },
  { source: '07_como_usar.md', anchor: 'como-usar', nav: 'Como usar', topic: 'uso' },
];
const ANCHORS = Object.fromEntries(SECTIONS.filter((s) => s.source).map((s) => [s.source, s.anchor]));

const FIXTURES = {
  'albert_statement.json': 'Extrato transcrito à mão: gabarito da extração e da reconciliação',
  'python_facts_and_letter.json': 'FACTS e carta da versão Python (primeiro commit do repositório), para conferir que os números não mudaram',
};

function read(relative) {
  return readFileSync(join(REPO, relative), 'utf8');
}

function latestStem() {
  const prefix = `carta_${SETTINGS.client.id}_`;
  const letters = readdirSync(join(REPO, OUTPUT_DIR)).filter((f) => f.startsWith(prefix) && f.endsWith('.html')).sort();
  if (!letters.length) throw new Error(`Nenhuma carta em ${OUTPUT_DIR}/: rode npm run letter antes de gerar o site.`);
  return letters.at(-1).slice('carta_'.length, -'.html'.length);
}

const STEM = latestStem();
const output = (prefix, extension) => `${OUTPUT_DIR}/${prefix}_${STEM}.${extension}`;

function headerSummary(relative) {
  const header = read(relative).match(/^\/\*([\s\S]*?)\*\//);
  if (!header) return 'Código';
  const flat = header[1].replace(/\s+/g, ' ').trim();
  const sentence = (flat.match(/^(.+?[.!?])(\s|$)/) || [null, flat])[1];
  return sentence.length > 170 ? `${sentence.slice(0, 167)}…` : sentence;
}

function listing(folder, pattern, describe) {
  const directory = join(REPO, folder);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => pattern.test(name)).sort().map((name) => [`${folder}/${name}`, describe]);
}

function fixtureDescription(relative) {
  const name = relative.split('/').pop();
  return FIXTURES[name] || 'Resposta real do LLM usada como entrada nos testes';
}

const FILE_GROUPS = [
  ['arquivos-entradas', 'Entradas do desafio', [
    ['Input/XP - Albert_s portfolio.pdf', 'Extrato da carteira do Albert (PDF original)'],
    ['Input/XP - Albert_s risk profile.pdf', 'Perfil de risco do Albert (PDF original)'],
    ['Input/XP - Macro analysis.pdf', 'Relatório Brasil Macro Mensal da XP, 06/02/2025'],
    ['Input/profitability_calc_wip.csv', 'Preços atual e do mês anterior das ações (valores corretos)'],
    ['Input/profitability_calc_wip.xlsx', 'Planilha de rentabilidade inacabada, com números corrompidos'],
    ['Input/XP - Albert_s portfolio.txt', 'Texto do extrato entregue no desafio (colunas embaralhadas)'],
    ['Input/XP - Albert_s risk profile.txt', 'Texto do perfil de risco (é o que o grafo lê)'],
    ['Input/XP - Macro analysis.txt', 'Texto do relatório macro entregue no desafio'],
    ['Input/xp_inc_logo.jpg', 'Logo da XP no cabeçalho da carta (brand.logo no settings.yaml)'],
  ]],
  ['arquivos-saidas', 'Saídas geradas (v2)', [
    [output('carta', 'pdf'), 'Carta para o cliente, 2 páginas'],
    [output('carta', 'html'), 'A mesma carta em HTML: é o que o node Code: Publish imprime em PDF'],
    [output('brief_assessor', 'md'), 'Brief do assessor: status, travas, alertas, recomendações e custo'],
    [output('facts', 'json'), 'FACTS usados pela carta e o texto final'],
    [output('run_log', 'json'), 'Tokens e custo de cada chamada ao LLM'],
  ]],
  ['arquivos-v1', 'Primeira versão (v1)', [
    [`${OUTPUT_DIR}/output_letter.docx`, 'Carta gerada pela v1, intacta'],
  ]],
  ['arquivos-rivet', 'Workflow Rivet (v2)', [
    ['enter_challenge.rivet-project', 'O projeto do Rivet: Main Graph, 2 loops, 6 grafos de LLM e o grafo original da v1 (gerado por src/build.mjs)'],
    ['src/README.md', 'O que tem em src/, como mexer e as regras do código dos nodes'],
    ['src/build.mjs', headerSummary],
    ['src/code/nodes.mjs', headerSummary],
    ...listing('src/code', /\.js$/, headerSummary),
    ...listing('src/code/lib', /\.js$/, headerSummary),
    ...listing('src/prompts', /\.md$/, 'Prompt'),
    ...listing('src/schemas', /\.json$/, 'JSON schema da resposta'),
  ]],
  ['arquivos-config', 'Configuração', [
    ['config/README.md', 'Para que serve cada arquivo e cada campo de config/'],
    ['config/settings.yaml', 'Entradas, período, modelos, preços por token, limites, logo e navegadores do PDF'],
    ['config/allocation_moderate.yaml', 'Faixas de alocação do perfil moderado (ilustrativas)'],
    ['config/research_shelf.yaml', 'Produtos e ações que o motor pode recomendar (ilustrativos)'],
    ['config/fund_registry.yaml', 'Fundos do extrato → CNPJ na CVM, conferidos à mão'],
  ]],
  ['arquivos-dados', 'Dados de mercado e inputs dos grafos', [
    ['data/README.md', 'O que é cada pasta de data/ e de onde veio'],
    ...listing('data/market', /./, 'Dado de mercado do período'),
    ...listing('data/rivet_inputs', /\.json$/, 'Valores padrão das entradas de um grafo de LLM no app'),
  ]],
  ['arquivos-evidencias', 'Evidências', listing('data/evidence', /\.json$/, 'Resposta real do LLM que motivou uma trava')],
  ['arquivos-testes', 'Testes', [
    ...listing('src/tests', /\.mjs$/, headerSummary),
    ...listing('src/tests/fixtures', /\.json$/, fixtureDescription),
  ]],
  ['arquivos-repo', 'Repositório e documentação', [
    ['README.md', 'README do repositório (em inglês)'],
    ['docs/README.md', 'O que tem em docs/: as fontes do site, o site gerado e o gerador'],
    ['package.json', 'Scripts npm e dependências (rivet-cli, pdf-parse, yaml; marked e mammoth para o site)'],
    ...listing('docs/site', /\.(mjs|js|css)$/, headerSummary),
  ]],
];

function href(relative) {
  return `../${relative.split('/').map(encodeURIComponent).join('/')}`;
}

function size(relative) {
  const bytes = statSync(join(REPO, relative)).size;
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function textPreview(relative) {
  const text = read(relative);
  const shown = text.length > TEXT_PREVIEW_LIMIT ? `${text.slice(0, TEXT_PREVIEW_LIMIT)}\n\n[prévia cortada; baixe o arquivo para ver tudo]` : text;
  return `<pre><code>${escapeHtml(shown)}</code></pre>`;
}

function csvPreview(relative) {
  const rows = read(relative).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(0, CSV_PREVIEW_ROWS + 1)
    .map((line) => line.split(line.includes(';') ? ';' : ','));
  const head = rows[0].map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = rows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function framed(relative, label) {
  return `<p><a href="${href(relative)}" target="_blank">Abrir ${label} em outra aba</a></p>`
    + `<iframe class="frame" data-src="${href(relative)}" title="${escapeHtml(relative)}"></iframe>`;
}

function preview(relative) {
  const kinds = {
    '.pdf': () => framed(relative, 'o PDF'),
    '.html': () => framed(relative, 'a página'),
    '.png': () => `<img src="${href(relative)}" alt="${escapeHtml(relative)}" loading="lazy">`,
    '.jpg': () => `<img src="${href(relative)}" alt="${escapeHtml(relative)}" loading="lazy">`,
    '.md': () => renderMarkdown(read(relative), ANCHORS),
    '.csv': () => csvPreview(relative),
    '.docx': () => '<p class="note">Formato sem prévia no navegador. Baixe o arquivo.</p>',
    '.xlsx': () => '<p class="note">Formato sem prévia no navegador. Baixe o arquivo.</p>',
  };
  return (kinds[extname(relative).toLowerCase()] || (() => textPreview(relative)))();
}

function fileEntry([relative, describe]) {
  if (!existsSync(join(REPO, relative))) return '';
  const description = typeof describe === 'function' ? describe(relative) : describe;
  return `<details class="file"><summary><span class="fname">${escapeHtml(relative)}</span>`
    + `<span class="fdesc">${escapeHtml(description)}</span><span class="fsize">${size(relative)}</span>`
    + `<a class="dl" href="${href(relative)}" download onclick="event.stopPropagation()">Baixar</a></summary>`
    + `<div class="preview">${preview(relative)}</div></details>`;
}

function fileSections() {
  const intro = '<p>Clique no nome para ver a prévia; "Baixar" abre ou salva o arquivo. Os links funcionam com a '
    + 'pasta do projeto aberta no computador.</p>'
    + '<div class="file-tools"><input id="file-filter" type="search" placeholder="Filtrar arquivos…"></div>';
  return intro + FILE_GROUPS.map(([anchor, title, files]) => `<section class="doc files" id="${anchor}" data-spy>`
    + `<h2>${escapeHtml(title)}</h2>${files.map(fileEntry).join('')}</section>`).join('');
}

async function v1LetterText() {
  const { value } = await mammoth.extractRawText({ path: join(REPO, OUTPUT_DIR, 'output_letter.docx') });
  return value.split(/\n+/).filter((p) => p.trim()).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

async function letterSection(section) {
  const brief = read(output('brief_assessor', 'md'));
  return `<section class="doc" id="${section.anchor}" data-spy><h1>A carta e o brief</h1>`
    + '<p>À esquerda, a carta da v1, como veio no desafio; à direita, a carta que o <strong>Main Graph: Enter Challenge</strong> '
    + 'gerou para o Albert, no mesmo HTML que o node <strong>Code: Publish</strong> imprime em PDF. Abaixo, o brief que o assessor '
    + 'recebe junto com a carta.</p>'
    + '<div class="two-col letters"><div><div class="col-title"><span>v1 · carta original</span></div>'
    + `<div class="v1-letter">${await v1LetterText()}</div></div>`
    + `<div><div class="col-title"><span>v2 · carta gerada</span><a href="${href(output('carta', 'pdf'))}" target="_blank">Abrir PDF</a></div>`
    + `<div class="letter-scroll"><div class="letter-frame"><iframe src="${href(output('carta', 'html'))}" `
    + 'title="Carta v2" scrolling="no"></iframe></div></div></div></div>'
    + `<h2>Brief do assessor</h2><div class="brief">${renderMarkdown(brief, ANCHORS)}</div></section>`;
}

function testCount() {
  return readdirSync(join(REPO, 'src', 'tests')).filter((f) => f.endsWith('.test.mjs'))
    .reduce((total, f) => total + (read(`src/tests/${f}`).match(/^test\(/gm) || []).length, 0);
}

function projectCounts() {
  const project = YAML.parse(read(SETTINGS.rivet.project));
  const generated = Object.entries(project.data.graphs).filter(([id]) => id.startsWith('graph_'));
  const codeNodes = generated.flatMap(([, graph]) => Object.keys(graph.nodes)).filter((key) => key.includes(']:code ')).length;
  return `${generated.length} | ${codeNodes}`;
}

function kpiCards() {
  const { facts } = JSON.parse(read(output('facts', 'json')));
  const runs = JSON.parse(read(output('run_log', 'json')));
  const alerts = (read(output('brief_assessor', 'md')).match(/^\| (alta|média|info) \|/gm) || []).length;
  const bench = facts.month.benchmarks || {};
  const idle = facts.allocation.find((a) => a.bucket.startsWith('Caixa')).current;
  const cost = runs.reduce((total, r) => total + r.cost_usd, 0).toFixed(2).replace('.', ',');
  return [
    ['Retorno no período', facts.month.return],
    ['Resultado no período', facts.month.result],
    ['CDI | Ibovespa', `${bench.cdi ?? '–'} | ${bench.ibovespa ?? '–'}`],
    ['Saldo + CDB vencido (% do patrimônio)', idle],
    ['Alertas para o assessor', String(alerts)],
    ['Custo da execução', `US$ ${cost}`],
    ['Grafos | Code nodes no Rivet', projectCounts()],
    ['Testes automatizados', String(testCount())],
  ];
}

function hero() {
  const cards = kpiCards().map(([label, value]) => `<div class="kpi"><span>${escapeHtml(label)}</span>`
    + `<strong>${escapeHtml(value)}</strong></div>`).join('');
  return `<div class="hero"><div class="eyebrow">${AUTHOR} · Challenge Enter · AI Deployment</div>`
    + '<h2>O LLM lê e escreve, o código calcula e <em>nada chega ao cliente sem checagem.</em></h2>'
    + `<p>Tudo roda num único grafo do Rivet, o <strong>Main Graph: Enter Challenge</strong>. Números da última execução para o Albert, `
    + `no período de ${SETTINGS.period.start.split('-').reverse().join('/')} a ${SETTINGS.period.end.split('-').reverse().join('/')}.</p>`
    + `<div class="kpis">${cards}</div>`
    + '<div class="actions"><a class="btn" href="#carta">Ver a carta</a>'
    + '<a class="btn secondary" href="#diagnostico">Diagnóstico da v1</a>'
    + '<a class="btn secondary" href="#arquitetura">Arquitetura</a>'
    + '<a class="btn secondary" href="#como-usar">Como usar</a>'
    + `<a class="btn secondary" href="${REPO_URL}" target="_blank" rel="noopener">GitHub ↗</a></div></div>`;
}

async function sectionHtml(section) {
  if (section.anchor === 'carta') return letterSection(section);
  return `<section class="doc" id="${section.anchor}" data-spy>${renderMarkdown(read(`docs/${section.source}`), ANCHORS)}</section>`;
}

function topicParts(topic) {
  if (topic.id === 'apresentacao') return { intro: hero() };
  if (topic.id === 'arquivos') return { body: fileSections(), subnav: FILE_GROUPS.map(([anchor, title]) => [anchor, title]) };
  return {};
}

async function build() {
  const sections = await Promise.all(SECTIONS.map(async (s) => ({ ...s, html: await sectionHtml(s) })));
  const topbar = `<div class="topbar">${AUTHOR} · Carta mensal XP com IA: da v1 à v2, tudo num grafo do Rivet`
    + `<a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a><a href="#carta">Ver a carta</a></div>`;
  const page = renderSite({
    title: 'Carta mensal XP · Documentação', tagline: 'Challenge · Carta mensal XP com IA', topbar,
    topics: TOPICS.map((topic) => ({ ...topic, ...topicParts(topic) })), sections,
  });
  writeFileSync(join(DOCS, 'index.html'), page, 'utf8');
  return join(DOCS, 'index.html');
}

console.log(await build());
