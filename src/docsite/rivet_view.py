"""Visualizador dos grafos do Rivet para o site: lê os arquivos .rivet-project (v2 e v1) e gera os dados
que o JavaScript do site desenha em SVG, com cada node na posição que ele tem no app do Rivet.
Para cada node guarda um resumo, o conteúdo completo (prompt, schema ou configuração do Chat) e alertas;
na v1, marca em vermelho as ligações trocadas e os nodes com problema, detectados a partir do conteúdo."""
from __future__ import annotations

import html
import json
import re
from typing import Any

import yaml

from xp_letter.config import REPO_ROOT

NODE_KEY = re.compile(r'^\[(?P<id>[^\]]+)\]:(?P<type>\S+) "(?P<title>.*)"$')
CONNECTION = re.compile(r'(?P<port>.+?)->"(?P<title>.+)"\s+(?P<node>[^/\s]+)/(?P<input>.+)')
DETAIL_LIMIT = 4000
PROJECTS = (
    ("rivet/xp_monthly_letter.rivet-project", "v2"),
    ("enter_challenge.rivet-project", "v1"),
)
SUMMARY_TOPICS = {"Portfolio": "portfolio_results", "Risk Profile": "risk_profile", "Macroeconomic": "macro_outlook"}
TOPIC_LABELS = {"portfolio_results": "carteira", "risk_profile": "perfil", "macro_outlook": "macro"}


def _first_line(text: str) -> str:
    line = next((l.strip("# ").strip() for l in text.splitlines() if l.strip()), "")
    return line if len(line) <= 70 else line[:67] + "…"


def _truncate(text: str) -> str:
    return text if len(text) <= DETAIL_LIMIT else text[:DETAIL_LIMIT] + "\n\n[cortado no site; ver o arquivo completo]"


def _summary(node_type: str, data: dict[str, Any]) -> str:
    if node_type in {"graphInput", "graphOutput"}:
        return f'{"entrada" if node_type == "graphInput" else "saída"} {data.get("id")} ({data.get("dataType")})'
    if node_type == "text":
        return _first_line(data.get("text", ""))
    if node_type == "prompt":
        return _first_line(data.get("promptText", ""))
    if node_type == "chat":
        schema = " · JSON schema" if data.get("responseFormat") == "json_schema" else ""
        return f'{data.get("model")} · temp {data.get("temperature")} · max {data.get("maxTokens")}{schema}'
    if node_type == "object":
        return "JSON schema da resposta"
    if node_type == "extractJson":
        return "texto → objeto JSON"
    if node_type == "readFile":
        return "lê o arquivo do caminho recebido" if data.get("usePathInput") else str(data.get("path"))
    return node_type


def _pretty_json(text: str) -> str:
    try:
        return json.dumps(json.loads(text), ensure_ascii=False, indent=2)
    except json.JSONDecodeError:
        return text


def _detail(node_type: str, data: dict[str, Any]) -> str:
    if node_type == "text":
        return data.get("text", "")
    if node_type == "prompt":
        return data.get("promptText", "")
    if node_type == "object":
        return _pretty_json(data.get("jsonTemplate", ""))
    if node_type == "chat":
        keys = ("model", "useModelInput", "temperature", "maxTokens", "responseFormat", "responseSchemaName", "outputUsage")
        return "\n".join(f"{key}: {data.get(key)}" for key in keys if key in data)
    if node_type == "graphInput":
        default = str(data.get("defaultValue") or "")
        return f'id: {data.get("id")}\ntipo: {data.get("dataType")}\n\nvalor padrão (última execução):\n{default}'
    return yaml.safe_dump(data, allow_unicode=True, sort_keys=False)


def _node_flags(node_type: str, data: dict[str, Any], outgoing: int) -> list[str]:
    flags = []
    text = json.dumps(data, ensure_ascii=False)
    if "C:\\\\Users\\\\" in text:
        flags.append("Caminho absoluto de outra máquina (C:\\Users\\blope\\...)")
    if node_type == "readFile" and data.get("errorOnMissingFile") is False:
        flags.append("errorOnMissingFile: false — arquivo ausente vira texto vazio, sem erro")
    if "Prezado João" in text:
        flags.append('Cliente fixo no prompt: "Prezado João"')
    if node_type == "chat" and outgoing == 0:
        flags.append("Nenhuma saída conectada: o resultado não sai do grafo")
    return flags


def _parse_nodes(raw_nodes: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    nodes, edges = [], []
    for key, body in raw_nodes.items():
        match = NODE_KEY.match(key)
        x, y, width = (body.get("visualData") or "0/0/260").split("/")[:3]
        data = body.get("data") or {}
        connections = body.get("outgoingConnections") or []
        nodes.append({
            "id": match["id"], "type": match["type"], "title": match["title"],
            "x": float(x), "y": float(y), "w": float(width) if width not in {"", "null"} else 260.0,
            "summary": _summary(match["type"], data), "detail": _truncate(_detail(match["type"], data)),
            "flags": _node_flags(match["type"], data, len(connections)), "text": data.get("promptText", ""),
        })
        for connection in connections:
            link = CONNECTION.match(connection)
            edges.append({"from": match["id"], "fromPort": link["port"], "to": link["node"], "toPort": link["input"], "flag": ""})
    return nodes, edges


def _expected_port(prompt_text: str) -> str | None:
    header = _first_line(prompt_text)
    return next((port for word, port in SUMMARY_TOPICS.items() if word in header), None)


def _flag_swapped_inputs(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
    by_id = {node["id"]: node for node in nodes}
    feeding_prompt = {e["to"]: by_id[e["from"]] for e in edges if e["toPort"] == "prompt" and by_id[e["from"]]["type"] == "prompt"}
    for edge in edges:
        source = feeding_prompt.get(edge["from"])
        if edge["toPort"] not in TOPIC_LABELS or source is None:
            continue
        expected = _expected_port(source["text"])
        if expected and expected != edge["toPort"]:
            edge["flag"] = f"resumo de {TOPIC_LABELS[expected]} entra em {edge['toPort']}"
            by_id[edge["to"]]["flags"].append(f"Entrada {edge['toPort']} recebe o resumo de {TOPIC_LABELS[expected]}")


def _port_lists(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
    for node in nodes:
        node["inputs"] = list(dict.fromkeys(e["toPort"] for e in edges if e["to"] == node["id"]))
        node["outputs"] = list(dict.fromkeys(e["fromPort"] for e in edges if e["from"] == node["id"]))
        node.pop("text")


def viewer_data() -> list[dict[str, Any]]:
    graphs = []
    for relative, version in PROJECTS:
        project = yaml.safe_load((REPO_ROOT / relative).read_text(encoding="utf-8"))
        for graph in project["data"]["graphs"].values():
            nodes, edges = _parse_nodes(graph["nodes"])
            _flag_swapped_inputs(nodes, edges)
            _port_lists(nodes, edges)
            graphs.append({
                "key": f'{version}-{graph["metadata"]["name"]}', "version": version, "name": graph["metadata"]["name"],
                "description": graph["metadata"].get("description") or "", "file": relative, "nodes": nodes, "edges": edges,
            })
    return graphs


def rivet_section(anchor: str) -> str:
    graphs = viewer_data()
    tabs = "".join(
        f'<button type="button" class="rv-tab{" v1" if g["version"] == "v1" else ""}" data-graph="{g["key"]}">'
        f'<span>{g["version"]}</span>{html.escape(g["name"])}</button>'
        for g in graphs
    )
    payload = json.dumps(graphs, ensure_ascii=False).replace("</", "<\\/")
    return (
        f'<section class="doc" id="{anchor}" data-spy><h1>Grafos do Rivet</h1>'
        "<p>Os grafos como estão nos arquivos <code>.rivet-project</code>, desenhados com as posições do app do Rivet. "
        "Clique num node para ver o prompt, o schema ou a configuração. A aba <strong>v1</strong> mostra o grafo "
        "original: as ligações trocadas e os nodes com problema aparecem em vermelho.</p>"
        f'<div class="rv-tabs">{tabs}</div>'
        '<div class="rv-toolbar"><span id="rv-caption"></span><div>'
        '<button type="button" data-zoom="-1">−</button><button type="button" data-zoom="0">Ajustar</button>'
        '<button type="button" data-zoom="1">+</button></div></div>'
        '<div class="rv-layout"><div class="rv-canvas" id="rv-canvas"></div>'
        '<aside class="rv-panel" id="rv-panel"><p class="note">Clique num node para ver os detalhes.</p></aside></div>'
        '<div class="rv-legend"><span class="k input">Graph Input / Output</span><span class="k prompt">Prompt / Text</span>'
        '<span class="k chat">Chat (LLM)</span><span class="k util">Object / Extract JSON</span>'
        '<span class="k file">Read File</span><span class="k bad">problema (v1)</span></div>'
        f'<script type="application/json" id="rv-data">{payload}</script></section>'
    )


RIVET_CSS = """
.rv-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0 12px; }
.rv-tab { border:1px solid var(--stroke-strong); background:transparent; color:var(--text); border-radius:8px; padding:9px 14px;
  font:13px var(--mono); cursor:pointer; }
.rv-tab span { font-family:var(--sans); text-transform:uppercase; letter-spacing:.2px; font-size:11px; color:var(--text-2); margin-right:8px; }
.rv-tab.active { background:var(--accent); color:#000; border-color:var(--accent); }
.rv-tab.active span { color:#000; }
.rv-tab.v1 { border-style:dashed; }
.rv-toolbar { display:flex; justify-content:space-between; align-items:center; margin:6px 0 8px; color:var(--text-2); font-size:13px; }
.rv-toolbar button { border:1px solid var(--stroke-strong); background:transparent; color:var(--text); border-radius:8px; padding:6px 12px;
  margin-left:6px; cursor:pointer; font:12px var(--sans); text-transform:uppercase; letter-spacing:.2px; }
.rv-layout { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:16px; }
.rv-canvas { border:1px solid var(--stroke); border-radius:12px; overflow:auto; max-height:720px; background:
  radial-gradient(circle, var(--stroke) 1px, transparent 1px) 0 0 / 18px 18px, var(--surface); }
.rv-canvas svg { display:block; }
.rv-panel { border:1px solid var(--stroke); border-radius:12px; padding:16px 18px; max-height:720px; overflow:auto; }
.rv-panel h3 { margin:0 0 4px; font:600 16px var(--sans); }
.rv-panel .type { font:12px var(--mono); color:var(--text-2); }
.rv-panel .flag { color:#d62828; font-size:13px; margin:8px 0 0; }
.rv-panel pre { max-height:480px; white-space:pre-wrap; }
.rv-node { cursor:pointer; }
.rv-node .box { fill:var(--bg); stroke:var(--stroke-strong); stroke-width:1.2; }
.rv-node.selected .box { stroke:var(--accent); stroke-width:3; }
.rv-node.flagged .box { stroke:#d62828; stroke-width:2.2; }
.rv-node .title { font:600 14px var(--sans); }
.rv-node .kind { font:11px var(--mono); opacity:.75; }
.rv-node .summary { font:12px var(--sans); fill:var(--text-2); }
.rv-node .port { font:11px var(--mono); fill:var(--text-2); }
.rv-node circle { fill:var(--bg); stroke:var(--text-2); stroke-width:1.2; }
.rv-edge { fill:none; stroke:var(--text-2); stroke-width:1.6; opacity:.8; }
.rv-edge.bad { stroke:#d62828; stroke-width:2.6; opacity:1; }
.rv-edge-label { font:600 13px var(--sans); fill:#d62828; paint-order:stroke; stroke:var(--surface); stroke-width:4px; }
.rv-legend { display:flex; flex-wrap:wrap; gap:14px; margin:12px 0 0; font-size:12px; color:var(--text-2); }
.rv-legend .k::before { content:""; display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:6px; vertical-align:-2px; }
.rv-legend .input::before { background:#ffae35; } .rv-legend .prompt::before { background:#e4e4e4; border:1px solid #bbb; }
.rv-legend .chat::before { background:#171717; } .rv-legend .util::before { background:#cecece; }
.rv-legend .file::before { background:#5a5a5a; } .rv-legend .bad::before { background:#d62828; }
@media (max-width: 1100px) { .rv-layout { grid-template-columns:1fr; } }
"""

RIVET_JS = """
(() => {
  const source = document.getElementById('rv-data');
  if (!source) return;
  const graphs = JSON.parse(source.textContent);
  const canvas = document.getElementById('rv-canvas');
  const panel = document.getElementById('rv-panel');
  const caption = document.getElementById('rv-caption');
  const HEAD = 36, SUM = 24, GAP = 20;
  const COLORS = { graphInput:['#ffae35','#000'], graphOutput:['#ffae35','#000'], prompt:['#e4e4e4','#000'], text:['#e4e4e4','#000'],
    chat:['#171717','#fff'], object:['#cecece','#000'], extractJson:['#cecece','#000'], readFile:['#5a5a5a','#fff'] };
  let scale = 0.85, current = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const height = n => HEAD + SUM + GAP * Math.max(1, n.inputs.length, n.outputs.length) + 10;
  const portY = (n, i) => n.y + HEAD + SUM + GAP * i + GAP / 2;
  function clip(text, width) { const max = Math.floor(width / 7.2); return text.length > max ? text.slice(0, max - 1) + '…' : text; }
  function nodeSvg(n) {
    const [fill, ink] = COLORS[n.type] || ['#cecece', '#000'];
    const h = height(n), flagged = n.flags.length ? ' flagged' : '';
    let s = `<g class="rv-node${flagged}" data-id="${esc(n.id)}"><rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${h}" rx="10"/>`;
    s += `<path d="M${n.x} ${n.y + 10} a10 10 0 0 1 10 -10 h${n.w - 20} a10 10 0 0 1 10 10 v${HEAD - 10} h${-n.w} z" fill="${fill}"/>`;
    s += `<text class="title" x="${n.x + 12}" y="${n.y + 23}" fill="${ink}">${esc(clip(n.title, n.w - 90))}</text>`;
    s += `<text class="kind" x="${n.x + n.w - 12}" y="${n.y + 23}" text-anchor="end" fill="${ink}">${esc(n.type)}</text>`;
    s += `<text class="summary" x="${n.x + 12}" y="${n.y + HEAD + 16}">${esc(clip(n.summary, n.w - 24))}</text>`;
    n.inputs.forEach((p, i) => { s += `<circle cx="${n.x}" cy="${portY(n, i)}" r="4.5"/><text class="port" x="${n.x + 10}" y="${portY(n, i) + 3.5}">${esc(p)}</text>`; });
    n.outputs.forEach((p, i) => { s += `<circle cx="${n.x + n.w}" cy="${portY(n, i)}" r="4.5"/><text class="port" x="${n.x + n.w - 10}" y="${portY(n, i) + 3.5}" text-anchor="end">${esc(p)}</text>`; });
    return s + '</g>';
  }
  function edgeSvg(e, byId) {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return '';
    const x1 = a.x + a.w, y1 = portY(a, a.outputs.indexOf(e.fromPort)), x2 = b.x, y2 = portY(b, b.inputs.indexOf(e.toPort));
    const dx = Math.max(60, Math.abs(x2 - x1) / 2);
    let s = `<path class="rv-edge${e.flag ? ' bad' : ''}" d="M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"/>`;
    if (e.flag) s += `<text class="rv-edge-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">✗ ${esc(e.flag)}</text>`;
    return s;
  }
  function draw(graph) {
    current = graph;
    const byId = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
    const minX = Math.min(...graph.nodes.map(n => n.x)) - 40, minY = Math.min(...graph.nodes.map(n => n.y)) - 40;
    const maxX = Math.max(...graph.nodes.map(n => n.x + n.w)) + 40, maxY = Math.max(...graph.nodes.map(n => n.y + height(n))) + 40;
    const width = maxX - minX, tall = maxY - minY;
    current.box = width;
    canvas.innerHTML = `<svg viewBox="${minX} ${minY} ${width} ${tall}" width="${width * scale}" height="${tall * scale}">`
      + graph.edges.map(e => edgeSvg(e, byId)).join('') + graph.nodes.map(nodeSvg).join('') + '</svg>';
    canvas.querySelectorAll('.rv-node').forEach(g => g.addEventListener('click', () => select(byId[g.dataset.id], g)));
    caption.textContent = `${graph.file} · ${graph.nodes.length} nodes · ${graph.edges.length} ligações${graph.description ? ' · ' + graph.description : ''}`;
    document.querySelectorAll('.rv-tab').forEach(t => t.classList.toggle('active', t.dataset.graph === graph.key));
    panel.innerHTML = '<p class="note">Clique num node para ver os detalhes.</p>';
  }
  function select(node, element) {
    canvas.querySelectorAll('.rv-node').forEach(g => g.classList.remove('selected'));
    element.classList.add('selected');
    const flags = node.flags.map(f => `<p class="flag">✗ ${esc(f)}</p>`).join('');
    panel.innerHTML = `<h3>${esc(node.title)}</h3><div class="type">${esc(node.type)} · ${esc(node.id)}</div>${flags}`
      + `<p>${esc(node.summary)}</p><pre><code>${esc(node.detail)}</code></pre>`;
  }
  document.querySelectorAll('.rv-tab').forEach(tab => tab.addEventListener('click', () => draw(graphs.find(g => g.key === tab.dataset.graph))));
  document.querySelectorAll('.rv-toolbar [data-zoom]').forEach(b => b.addEventListener('click', () => {
    const step = Number(b.dataset.zoom);
    scale = step === 0 ? Math.max(0.3, (canvas.clientWidth - 8) / current.box) : Math.min(2, Math.max(0.3, scale + step * 0.15));
    draw(current);
  }));
  draw(graphs.find(g => g.name === 'write_letter') || graphs[0]);
})();
"""
