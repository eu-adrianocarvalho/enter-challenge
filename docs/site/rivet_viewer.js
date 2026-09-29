/* Desenha no site os grafos do Rivet em SVG, com cada node na posição do app, a partir dos dados que
   rivet_graphs.mjs embute na página. Clicar num node mostra o conteúdo no painel; num subgrafo ou loop, o
   painel oferece abrir o grafo chamado. Abas trocam de grafo e os botões ajustam o zoom. */

(() => {
  const source = document.getElementById('rv-data');
  if (!source) return;
  const graphs = JSON.parse(source.textContent);
  const canvas = document.getElementById('rv-canvas');
  const panel = document.getElementById('rv-panel');
  const caption = document.getElementById('rv-caption');
  const HEAD = 36;
  const SUM = 24;
  const GAP = 20;
  const COLORS = {
    graphInput: ['#ffae35', '#000'], graphOutput: ['#ffae35', '#000'], prompt: ['#e4e4e4', '#000'], text: ['#e4e4e4', '#000'],
    chat: ['#171717', '#fff'], object: ['#cecece', '#000'], extractJson: ['#cecece', '#000'], readFile: ['#5a5a5a', '#fff'],
    code: ['#ffe2b0', '#000'], subGraph: ['#3c3c3c', '#fff'], loopUntil: ['#3c3c3c', '#fff'],
  };
  let scale = 0.6;
  let current = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const height = (n) => HEAD + SUM + GAP * Math.max(1, n.inputs.length, n.outputs.length) + 10;
  const portY = (n, i) => n.y + HEAD + SUM + GAP * i + GAP / 2;

  function clip(text, width) {
    const max = Math.floor(width / 7.2);
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function nodeSvg(n) {
    const [fill, ink] = COLORS[n.type] || ['#cecece', '#000'];
    const h = height(n);
    let s = `<g class="rv-node${n.flags.length ? ' flagged' : ''}" data-id="${esc(n.id)}">`
      + `<rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${h}" rx="10"/>`
      + `<path d="M${n.x} ${n.y + 10} a10 10 0 0 1 10 -10 h${n.w - 20} a10 10 0 0 1 10 10 v${HEAD - 10} h${-n.w} z" fill="${fill}"/>`
      + `<text class="title" x="${n.x + 12}" y="${n.y + 23}" fill="${ink}">${esc(clip(n.title, n.w - 90))}</text>`
      + `<text class="kind" x="${n.x + n.w - 12}" y="${n.y + 23}" text-anchor="end" fill="${ink}">${esc(n.type)}</text>`
      + `<text class="summary" x="${n.x + 12}" y="${n.y + HEAD + 16}">${esc(clip(n.summary, n.w - 24))}</text>`;
    n.inputs.forEach((p, i) => {
      s += `<circle cx="${n.x}" cy="${portY(n, i)}" r="4.5"/><text class="port" x="${n.x + 10}" y="${portY(n, i) + 3.5}">${esc(p)}</text>`;
    });
    n.outputs.forEach((p, i) => {
      s += `<circle cx="${n.x + n.w}" cy="${portY(n, i)}" r="4.5"/>`
        + `<text class="port" x="${n.x + n.w - 10}" y="${portY(n, i) + 3.5}" text-anchor="end">${esc(p)}</text>`;
    });
    return `${s}</g>`;
  }

  function edgeSvg(e, byId) {
    const a = byId[e.from];
    const b = byId[e.to];
    if (!a || !b) return '';
    const x1 = a.x + a.w;
    const y1 = portY(a, a.outputs.indexOf(e.fromPort));
    const x2 = b.x;
    const y2 = portY(b, b.inputs.indexOf(e.toPort));
    const dx = Math.max(60, Math.abs(x2 - x1) / 2);
    const path = `<path class="rv-edge${e.flag ? ' bad' : ''}" d="M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"/>`;
    const label = e.flag ? `<text class="rv-edge-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">✗ ${esc(e.flag)}</text>` : '';
    return path + label;
  }

  function draw(graph) {
    current = graph;
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    const minX = Math.min(...graph.nodes.map((n) => n.x)) - 40;
    const minY = Math.min(...graph.nodes.map((n) => n.y)) - 40;
    const width = Math.max(...graph.nodes.map((n) => n.x + n.w)) + 40 - minX;
    const tall = Math.max(...graph.nodes.map((n) => n.y + height(n))) + 40 - minY;
    current.box = width;
    canvas.innerHTML = `<svg viewBox="${minX} ${minY} ${width} ${tall}" width="${width * scale}" height="${tall * scale}">`
      + graph.edges.map((e) => edgeSvg(e, byId)).join('') + graph.nodes.map(nodeSvg).join('') + '</svg>';
    canvas.querySelectorAll('.rv-node').forEach((g) => g.addEventListener('click', () => select(byId[g.dataset.id], g)));
    caption.textContent = `${graph.file} · ${graph.nodes.length} nodes · ${graph.edges.length} ligações`
      + (graph.description ? ` · ${graph.description}` : '');
    document.querySelectorAll('.rv-tab').forEach((t) => t.classList.toggle('active', t.dataset.graph === graph.key));
    panel.innerHTML = '<p class="note">Clique num node para ver os detalhes.</p>';
  }

  function select(node, element) {
    canvas.querySelectorAll('.rv-node').forEach((g) => g.classList.remove('selected'));
    element.classList.add('selected');
    const flags = node.flags.map((f) => `<p class="flag">✗ ${esc(f)}</p>`).join('');
    const target = graphs.find((g) => g.key === node.target);
    const open = target ? `<button type="button" class="btn rv-open" data-graph="${esc(target.key)}">Abrir o grafo ${esc(target.name)}</button>` : '';
    panel.innerHTML = `<h3>${esc(node.title)}</h3><div class="type">${esc(node.type)} · ${esc(node.id)}</div>${flags}`
      + `<p>${esc(node.summary)}</p>${open}<pre><code>${esc(node.detail)}</code></pre>`;
    panel.querySelector('.rv-open')?.addEventListener('click', () => draw(target));
  }

  function fit() {
    scale = Math.max(0.1, (canvas.clientWidth - 8) / current.box);
    draw(current);
  }

  document.querySelectorAll('.rv-tab').forEach((tab) => tab.addEventListener('click', () => {
    current = graphs.find((g) => g.key === tab.dataset.graph);
    fit();
  }));
  document.querySelectorAll('.rv-toolbar [data-zoom]').forEach((b) => b.addEventListener('click', () => {
    const step = Number(b.dataset.zoom);
    if (step === 0) return fit();
    scale = Math.min(2, Math.max(0.1, scale + step * 0.15));
    return draw(current);
  }));
  draw(graphs.find((g) => g.main) || graphs[0]);
  window.fitRivetGraph = () => { if (canvas.clientWidth) fit(); };
})();
