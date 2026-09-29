"""Gera o projeto do Rivet (rivet/xp_monthly_letter.rivet-project) a partir dos prompts e schemas.
Todos os grafos têm o mesmo formato: inputs → prompt → Chat da OpenAI com JSON schema → Extract JSON
→ saídas result e usage. Modelo, temperatura e limite de tokens vêm de GRAPHS e de config/settings.yaml.
É chamado por src/build_rivet.py."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from xp_letter.config import load_settings, repo_path

PROMPTS_DIR = repo_path("rivet/prompts")
SCHEMAS_DIR = repo_path("rivet/schemas")
DEFAULT_INPUTS_DIR = repo_path("data/rivet_inputs")
PROJECT_ID = "xp-monthly-letter-v2"


@dataclass(frozen=True)
class GraphSpec:
    name: str
    description: str
    inputs: tuple[str, ...]
    model_key: str
    temperature: float
    max_tokens: int


GRAPHS = (
    GraphSpec("extract_portfolio", "Transcribes the portfolio statement into validated JSON.",
              ("statement_text", "corrections"), "extraction", 0.0, 8000),
    GraphSpec("extract_profile", "Extracts the suitability constraints from the risk profile.",
              ("profile_text",), "extraction", 0.0, 2000),
    GraphSpec("macro_outlook", "Monthly evidence-backed macro brief, shared by every client letter.",
              ("report_text",), "writing", 0.1, 6000),
    GraphSpec("advise", "Chooses and explains the rule-sized recommendation candidates.",
              ("profile_json", "allocation_json", "candidates_json", "macro_json"), "writing", 0.2, 2500),
    GraphSpec("write_letter", "Writes the client letter (pt-BR) using only figures from FACTS.",
              ("facts_json", "word_budget", "corrections"), "writing", 0.3, 4096),
    GraphSpec("review_letter", "Compliance review: flags letter statements that FACTS does not support.",
              ("facts_json", "letter_json"), "writing", 0.0, 2000),
)


def graph_id(name: str) -> str:
    return f"graph_{name}"


def read_prompt(name: str, part: str) -> str:
    return (PROMPTS_DIR / f"{name}.{part}.md").read_text(encoding="utf-8").strip()


def read_schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMAS_DIR / f"{name}.json").read_text(encoding="utf-8"))


def _default_inputs(name: str) -> dict[str, str]:
    path = DEFAULT_INPUTS_DIR / f"{name}.json"
    defaults = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return {**defaults, "corrections": "(none)"} if "corrections" in defaults else defaults


def _connection(output_port: str, target_title: str, target_id: str, input_port: str) -> str:
    return f'{output_port}->"{target_title}" {target_id}/{input_port}'


def _node(node_type: str, title: str, x: int, y: int, data: dict[str, Any], connections: list[str], width: int = 300) -> dict:
    node = {"visualData": f"{x}/{y}/{width}/1//", "data": data}
    if connections:
        node["outgoingConnections"] = sorted(connections)
    return {"type": node_type, "title": title, "body": node}


def _chat_data(spec: GraphSpec, model: str) -> dict[str, Any]:
    return {
        "model": model,
        "useModelInput": True,
        "temperature": spec.temperature,
        "useTemperatureInput": False,
        "top_p": 1,
        "useTopP": False,
        "useTopPInput": False,
        "useUseTopPInput": False,
        "maxTokens": spec.max_tokens,
        "useMaxTokensInput": False,
        "useStop": False,
        "stop": "",
        "useStopInput": False,
        "responseFormat": "json_schema",
        "responseSchemaName": spec.name,
        "enableFunctionUse": False,
        "parallelFunctionCalling": False,
        "cache": False,
        "useAsGraphPartialOutput": False,
        "useServerTokenCalculation": True,
        "outputUsage": True,
        "additionalParameters": [],
        "useAdditionalParametersInput": False,
    }


def build_graph(spec: GraphSpec, model: str) -> dict[str, Any]:
    ids = {role: f"{spec.name}__{role}" for role in ("system", "prompt", "schema", "chat", "json", "result", "usage", "model")}
    defaults = _default_inputs(spec.name)
    nodes = {}
    for index, input_name in enumerate(spec.inputs):
        nodes[f"{spec.name}__input_{input_name}"] = _node(
            "graphInput", f"Input {input_name}", 0, index * 220,
            {"id": input_name, "dataType": "string", "defaultValue": defaults.get(input_name, ""), "useDefaultValueInput": False},
            [_connection("data", "User prompt", ids["prompt"], input_name)],
        )
    nodes[ids["model"]] = _node(
        "graphInput", "Input model", 0, len(spec.inputs) * 220,
        {"id": "model", "dataType": "string", "defaultValue": model, "useDefaultValueInput": False},
        [_connection("data", "Chat", ids["chat"], "model")],
    )
    nodes[ids["system"]] = _node(
        "text", "System prompt", 420, -260, {"text": read_prompt(spec.name, "system"), "normalizeLineEndings": True},
        [_connection("output", "Chat", ids["chat"], "systemPrompt")], width=420,
    )
    nodes[ids["prompt"]] = _node(
        "prompt", "User prompt", 420, 40,
        {"type": "user", "useTypeInput": False, "promptText": read_prompt(spec.name, "user"), "enableFunctionCall": False},
        [_connection("output", "Chat", ids["chat"], "prompt")], width=420,
    )
    nodes[ids["schema"]] = _node(
        "object", "Response schema", 420, 420, {"jsonTemplate": json.dumps(read_schema(spec.name), ensure_ascii=False, indent=2)},
        [_connection("output", "Chat", ids["chat"], "responseSchema")], width=420,
    )
    nodes[ids["chat"]] = _node(
        "chat", "Chat", 960, 40, _chat_data(spec, model),
        [_connection("response", "Extract JSON", ids["json"], "input"), _connection("usage", "Output usage", ids["usage"], "value")],
        width=260,
    )
    nodes[ids["json"]] = _node(
        "extractJson", "Extract JSON", 1300, 40, {}, [_connection("output", "Output result", ids["result"], "value")], width=250,
    )
    nodes[ids["result"]] = _node("graphOutput", "Output result", 1620, 0, {"id": "result", "dataType": "object"}, [])
    nodes[ids["usage"]] = _node("graphOutput", "Output usage", 1620, 240, {"id": "usage", "dataType": "object"}, [])
    return {
        "metadata": {"id": graph_id(spec.name), "name": spec.name, "description": spec.description},
        "nodes": {f'[{node_id}]:{node["type"]} "{node["title"]}"': node["body"] for node_id, node in nodes.items()},
    }


def build_project() -> dict[str, Any]:
    models = load_settings().raw["models"]
    return {
        "version": 4,
        "data": {
            "attachedData": {"trivet": {"testSuites": [], "version": 1}},
            "graphs": {graph_id(spec.name): build_graph(spec, models[spec.model_key]) for spec in GRAPHS},
            "metadata": {
                "id": PROJECT_ID,
                "title": "XP Monthly Letter v2",
                "description": "LLM steps of the XP monthly client letter. Deterministic steps run in the xp_letter package.",
                "mainGraphId": graph_id("write_letter"),
            },
            "plugins": [],
            "references": [],
        },
    }


class _LiteralDumper(yaml.SafeDumper):
    pass


def _represent_str(dumper: yaml.SafeDumper, value: str) -> yaml.ScalarNode:
    style = "|" if "\n" in value else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style=style)


_LiteralDumper.add_representer(str, _represent_str)


def write_project(path: Path | None = None) -> Path:
    target = path or repo_path(load_settings().raw["rivet"]["project"])
    text = yaml.dump(build_project(), Dumper=_LiteralDumper, allow_unicode=True, sort_keys=False, width=10_000)
    target.write_text(text, encoding="utf-8")
    return target

