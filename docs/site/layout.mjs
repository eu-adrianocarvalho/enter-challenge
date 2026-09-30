/* Monta uma página no formato do site de documentação, no visual da Enter: barra superior, barra lateral com
   os tópicos (só o aberto se expande), um tópico visível por vez e paginação entre eles. Recebe o HTML de
   cada seção pronto e embute o CSS e o JS de docs/site/, então a página abre sozinha. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeHtml } from './markdown.mjs';

const SITE = dirname(fileURLToPath(import.meta.url));
const FONTS = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500'
  + '&family=Noto+Serif:wght@300;400&display=swap';
export const AUTHOR = 'Adriano da Silva de Carvalho';
export const REPO_URL = 'https://github.com/eu-adrianocarvalho/enter-challenge';

function number(index) {
  return String(index + 1).padStart(2, '0');
}

function pager(topics, index) {
  const previous = topics[index - 1];
  const following = topics[index + 1];
  const back = previous ? `<a class="prev" href="#${previous.id}"><small>← Anterior</small><strong>${previous.label}</strong></a>` : '';
  const next = following ? `<a class="next" href="#${following.id}"><small>Próximo →</small><strong>${following.label}</strong></a>` : '';
  return `<div class="pager">${back}${next}</div>`;
}

function topicPage(topics, sections, index) {
  const topic = topics[index];
  const head = `<div class="page-head"><span class="num">${number(index)}</span><h1>${topic.label}</h1>`
    + `<p>${escapeHtml(topic.summary)}</p></div>`;
  const body = topic.body ?? sections.filter((s) => s.topic === topic.id).map((s) => s.html).join('');
  return `<div class="page" id="${topic.id}">${head}${topic.intro ?? ''}${body}${pager(topics, index)}</div>`;
}

function subnav(topic, sections) {
  return topic.subnav ?? sections.filter((s) => s.topic === topic.id).map((s) => [s.anchor, s.nav]);
}

function sidebar(topics, sections, tagline) {
  const items = topics.map((topic, index) => {
    const links = subnav(topic, sections).map(([anchor, title]) => `<a href="#${anchor}" data-target="${anchor}">${escapeHtml(title)}</a>`).join('');
    return `<div class="nav-topic" data-page="${topic.id}"><a class="topic-link" href="#${topic.id}">`
      + `<span class="num">${number(index)}</span>${topic.label}</a><div class="subnav">${links}</div></div>`;
  }).join('');
  return '<nav class="sidebar"><div class="brand"><div class="mark">ENTER<b></b></div>'
    + `<small>${escapeHtml(tagline)}</small>`
    + `<div class="author"><strong>${AUTHOR}</strong>`
    + `<a href="${REPO_URL}" target="_blank" rel="noopener">GitHub · enter-challenge ↗</a></div></div>`
    + `${items}<button class="theme-toggle" id="theme" type="button">Tema claro / escuro</button></nav>`;
}

export function renderSite({ title, tagline, topbar, topics, sections }) {
  const asset = (name) => readFileSync(join(SITE, name), 'utf8');
  const pages = topics.map((_, index) => topicPage(topics, sections, index)).join('');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${escapeHtml(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com">`
    + `<link href="${FONTS}" rel="stylesheet"><style>${asset('style.css')}</style></head>`
    + `<body>${topbar}<div class="layout">${sidebar(topics, sections, tagline)}<main>${pages}</main></div>`
    + `<script>${asset('app.js')}</script><script type="module">${asset('mermaid.js')}</script></body></html>`;
}
