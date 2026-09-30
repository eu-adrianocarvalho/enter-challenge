/* Desenha os diagramas Mermaid da documentação com as cores da Enter, no tema claro ou escuro. Carrega o
   Mermaid da CDN (precisa de internet) e só desenha os diagramas do tópico aberto, porque diagramas em
   elementos escondidos saem com tamanho zero. Cada diagrama é desenhado em fila com um id próprio: o
   mermaid.run gera ids pelo relógio, e dois diagramas no mesmo milissegundo misturam os nodes. */

import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const root = document.documentElement;
const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const LIGHT = {
  primaryColor: '#f3f3f3', primaryTextColor: '#000', primaryBorderColor: '#000', lineColor: '#3c3c3c', secondaryColor: '#ffae35',
  tertiaryColor: '#ffffff', clusterBkg: '#fafafa', clusterBorder: '#cecece', edgeLabelBackground: '#ffffff', actorBkg: '#f3f3f3',
  actorBorder: '#000', noteBkgColor: '#fff4e0', noteBorderColor: '#ffae35',
};
const DARK = {
  primaryColor: '#1f1f1f', primaryTextColor: '#fff', primaryBorderColor: '#bbbbbb', lineColor: '#bbbbbb', secondaryColor: '#ffae35',
  tertiaryColor: '#171717', clusterBkg: '#141414', clusterBorder: '#3c3c3c', edgeLabelBackground: '#0e0e0e', actorBkg: '#1f1f1f',
  actorBorder: '#bbbbbb', actorTextColor: '#fff', signalColor: '#ddd', signalTextColor: '#fff', noteBkgColor: '#2a2111',
  noteBorderColor: '#ffae35', noteTextColor: '#fff', labelTextColor: '#fff',
};

mermaid.initialize({
  startOnLoad: false, theme: 'base', securityLevel: 'loose', flowchart: { curve: 'basis', htmlLabels: true },
  themeVariables: { fontFamily: 'Geist, Segoe UI, sans-serif', fontSize: '14px', ...(dark ? DARK : LIGHT) },
});
let queue = Promise.resolve();
let counter = 0;

async function draw(node) {
  const { svg, bindFunctions } = await mermaid.render(`diagram-${counter++}`, node.textContent);
  node.innerHTML = svg;
  bindFunctions?.(node);
}

window.renderMermaidIn = (page) => {
  const nodes = [...(page || document).querySelectorAll('pre.mermaid:not([data-queued])')];
  nodes.forEach((node) => {
    node.setAttribute('data-queued', '');
    queue = queue.then(() => draw(node)).catch((error) => node.setAttribute('title', String(error?.message ?? error)));
  });
};
window.renderMermaidIn(document.querySelector('.page:not([hidden])'));
