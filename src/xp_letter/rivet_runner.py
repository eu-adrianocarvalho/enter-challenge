"""Executa um grafo do Rivet pelo rivet-cli (Node.js), passando os inputs em JSON e lendo o resultado.
Guarda cada resposta em data/llm/ com uma chave que combina prompt, schema, modelo e inputs: mudar um
prompt invalida só aquele grafo, e repetir a execução não gasta tokens.
Calcula tokens e custo em dólar com os preços de config/settings.yaml."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from xp_letter.config import Settings, repo_path
from xp_letter.rivet_project import DEFAULT_INPUTS_DIR, read_prompt, read_schema


class RivetError(RuntimeError):
    pass


@dataclass(frozen=True)
class GraphRun:
    graph: str
    model: str
    result: dict[str, Any]
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    seconds: float
    cached: bool


def _cache_key(graph: str, model: str, inputs: dict[str, str]) -> str:
    payload = json.dumps(
        [graph, model, read_prompt(graph, "system"), read_prompt(graph, "user"), read_schema(graph), inputs],
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _cost(settings: Settings, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    prices = settings.raw["pricing_usd_per_million_tokens"].get(model)
    if not prices:
        return 0.0
    return (prompt_tokens * prices["input"] + completion_tokens * prices["output"]) / 1_000_000


def _invoke_cli(settings: Settings, graph: str, inputs: dict[str, str]) -> dict[str, Any]:
    node = shutil.which("node")
    if node is None:
        raise RivetError("Node.js not found on PATH; it is required to run the Rivet graphs.")
    command = [node, str(repo_path(settings.raw["rivet"]["cli"])), "run",
               str(repo_path(settings.raw["rivet"]["project"])), graph, "--inputs-stdin"]
    completed = subprocess.run(
        command, input=json.dumps(inputs, ensure_ascii=False), capture_output=True, text=True, encoding="utf-8",
        env=os.environ.copy(), cwd=repo_path("."), timeout=settings.raw["rivet"]["timeout_seconds"],
    )
    if completed.returncode != 0:
        raise RivetError(f"Graph {graph} failed:\n{completed.stderr.strip() or completed.stdout.strip()}")
    return json.loads(completed.stdout)


def _remember_inputs(graph: str, inputs: dict[str, str]) -> None:
    DEFAULT_INPUTS_DIR.mkdir(parents=True, exist_ok=True)
    (DEFAULT_INPUTS_DIR / f"{graph}.json").write_text(json.dumps(inputs, ensure_ascii=False, indent=2), encoding="utf-8")


def run_graph(settings: Settings, graph: str, model: str, inputs: dict[str, str], refresh: bool = False) -> GraphRun:
    cache_path = settings.data_dir / "llm" / f"{graph}-{_cache_key(graph, model, inputs)}.json"
    _remember_inputs(graph, inputs)
    if cache_path.exists() and not refresh:
        return GraphRun(**{**json.loads(cache_path.read_text(encoding="utf-8")), "cached": True})
    started = time.monotonic()
    outputs = _invoke_cli(settings, graph, {**inputs, "model": model})
    result = outputs.get("result", {}).get("value")
    if not isinstance(result, dict):
        raise RivetError(f"Graph {graph} returned no JSON result: {json.dumps(outputs)[:500]}")
    usage = outputs.get("usage", {}).get("value") or {}
    prompt_tokens, completion_tokens = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
    run = GraphRun(
        graph=graph, model=model, result=result,
        prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        cost_usd=_cost(settings, model, prompt_tokens, completion_tokens),
        seconds=round(time.monotonic() - started, 1), cached=False,
    )
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(asdict(run), ensure_ascii=False, indent=2), encoding="utf-8")
    return run
