"""Executa o pipeline inteiro sem API, com os grafos do Rivet trocados por respostas fixas.
Verifica a correção automática da extração (subtotal trocado) e da carta (número inventado), o descarte
de uma projeção sem base, a montagem das recomendações e a geração do DOCX."""
import json
from pathlib import Path

import pytest

from xp_letter import pipeline
from xp_letter.config import Settings, load_settings
from xp_letter.rivet_runner import GraphRun

PROFILE = {
    "client_name": "Albert", "profile": "moderado", "horizon": "médio a longo prazo", "volatility_tolerance": "moderada",
    "objectives_pt": ["Preservar o poder de compra"], "eligible_products": [], "min_credit_rating": "BB+",
    "guidance_pt": ["Diversificar"], "summary_pt": "Perfil moderado, com horizonte de médio a longo prazo.",
}
MACRO = {
    "report_title": "Brasil Macro Mensal", "report_date": "06/02/2025", "headline_pt": "Juros altos por mais tempo.",
    "sentiment": "cauteloso",
    "projections": [
        {"id": "P1", "indicator": "Selic terminal", "value": "15,50%", "horizon": "2025",
         "quote": "Vemos a taxa Selic terminal em 15,50%, com altas de 1,00-0,75-0,50 p.p."},
        {"id": "P2", "indicator": "IPCA", "value": "6,1%", "horizon": "2025",
         "quote": "Mantivemos a projeção de 6,1% para o IPCA de 2025"},
        {"id": "P3", "indicator": "Selic", "value": "9%", "horizon": "2025", "quote": "A Selic deve se estabilizar em 9%"},
    ],
    "themes": [{"id": "T1", "title_pt": "EUA", "summary_pt": "Sem cortes de juros nos EUA.",
                "quote": "Não contemplamos mais cortes de juros nos EUA em nosso cenário base"}],
    "risks": [],
    "implications": [{"id": "I1", "asset_class": "pos_fixado", "view": "favoravel",
                      "summary_pt": "Juros altos favorecem o pós-fixado.", "evidence_ids": ["P1"]}],
}
ADVICE = {
    "recommendations": [
        {"priority": 1, "title_pt": "Reinvestir o caixa parado", "candidate_ids": ["reinvest_post_fixed", "reinvest_inflation_linked"],
         "rationale_pt": "Com juros altos, o caixa deve render.", "macro_evidence_ids": ["P1", "P2"]},
        {"priority": 2, "title_pt": "Trocar ações fora do perfil", "candidate_ids": ["sell_HAPV3", "buy_ITUB4", "ghost"],
         "rationale_pt": "Pagadoras de dividendos combinam com o perfil.", "macro_evidence_ids": ["I1"]},
    ],
    "advisor_notes_pt": ["Confirmar a liquidação do CDB."],
}


def _letter_from(facts: dict, invent: bool) -> dict:
    month = facts["month"]
    performance = f"No período, a carteira rendeu {month['return']} ({month['result']}), ante {month['benchmarks']['cdi']} do CDI."
    if invent:
        performance += " Isso ficou 0,2 p.p. abaixo do benchmark."
    return {
        "subject": "Seu relatório mensal", "greeting": f"Prezado {facts['client']['first_name']},",
        "performance": performance, "outlook": f"A XP projeta Selic de {facts['macro']['projections'][0]['value']}.",
        "recommendations": "Sugerimos os movimentos da tabela abaixo.", "closing": "Seguimos à disposição.",
    }


def _statement(transposed_subtotal: bool) -> dict:
    statement = json.loads((Path(__file__).parent / "fixtures" / "albert_statement.json").read_text(encoding="utf-8"))
    if transposed_subtotal:
        statement["class_totals"][0]["subtotal"] = 60131.79
    return statement


def fake_run_graph(settings, graph, model, inputs, refresh=False):
    results = {
        "extract_portfolio": lambda: _statement(transposed_subtotal=inputs["corrections"] == "(none)"),
        "extract_profile": lambda: PROFILE,
        "macro_outlook": lambda: MACRO,
        "advise": lambda: ADVICE,
        "write_letter": lambda: _letter_from(json.loads(inputs["facts_json"]), invent=inputs["corrections"] == "(none)"),
        "review_letter": lambda: {"issues": [
            {"field": "closing", "excerpt": "Seguimos à disposição.", "problem": "Could be warmer.", "severity": "minor"},
        ]},
    }
    return GraphRun(graph, model, results[graph](), 1000, 200, 0.0036, 0.1, cached=False)


@pytest.fixture
def settings(tmp_path) -> Settings:
    raw = json.loads(json.dumps(load_settings().raw))
    raw["paths"]["output_dir"] = str(tmp_path)
    return Settings(raw)


def test_offline_run_repairs_letter_and_writes_outputs(settings, monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "run_graph", fake_run_graph)
    brief_path = pipeline.run(settings, pipeline.RunOptions(make_pdf=False))
    brief = brief_path.read_text(encoding="utf-8")
    output = json.loads(next(tmp_path.glob("facts_*.json")).read_text(encoding="utf-8"))
    assert "PRONTA PARA REVISÃO" in brief
    assert "A 1ª transcrição falhou" in brief
    assert "2 versão(ões)" in brief
    assert "0 apontamento(s) grave(s)" in brief
    assert "0,2 p.p." not in json.dumps(output["letter"], ensure_ascii=False)
    assert [p["value"] for p in output["facts"]["macro"]["projections"]] == ["15,50%", "6,1%"]
    assert [m["asset"] for r in output["facts"]["recommendations"] for m in r["moves"]] == [
        "Tesouro Selic 2029", "Tesouro IPCA+ 2029", "HAPV3", "ITUB4",
    ]
    assert list(tmp_path.glob("carta_*.docx"))
