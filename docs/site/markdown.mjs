/* Converte os .md da documentação em HTML, para o site e para o relatório: tabelas e blocos de código pelo
   marked, blocos ```mermaid em <pre class="mermaid"> para o Mermaid desenhar no navegador e links entre os
   .md em âncoras das seções do site. */

import { marked } from 'marked';

const MERMAID_BLOCK = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function renderMarkdown(text, anchors = {}) {
  const html = marked.parse(text, { gfm: true }).replace(MERMAID_BLOCK, '<pre class="mermaid">$1</pre>');
  return Object.entries(anchors).reduce((page, [file, anchor]) => page.replaceAll(`href="${file}"`, `href="#${anchor}"`), html);
}
