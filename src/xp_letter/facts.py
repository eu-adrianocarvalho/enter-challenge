"""Monta o bloco FACTS: todos os números e fatos que o LLM pode usar na carta, já formatados em pt-BR
(rentabilidade, benchmarks, alocação, recomendações e macro).
Também junta a resposta do grafo advise aos candidatos calculados, descartando ids desconhecidos.
O fact-check depois exige que todo número da carta exista aqui."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from xp_letter.benchmarks import Benchmarks
from xp_letter.formatting import brl, date_br, long_date_pt, month_year_pt, pct, pp
from xp_letter.portfolio import Statement
from xp_letter.returns import Aggregate, MonthlyReturns
from xp_letter.suitability import BUCKET_LABELS, Allocation, Candidate

CLASS_LABELS = {"stock": "Ações", "fund": "Fundos de investimento", "fixed_income": "Renda fixa"}
VIEW_LABELS = {"favoravel": "favorável", "neutra": "neutra", "desfavoravel": "desfavorável"}


@dataclass(frozen=True)
class Recommendation:
    priority: int
    title: str
    rationale: str
    candidates: list[Candidate]
    evidence_ids: list[str]

    def lines(self) -> list[dict[str, str]]:
        return [
            {"action": c.action.capitalize(), "asset": c.asset, "amount": brl(c.amount)}
            for c in self.candidates
        ]


def recommendations_from_advice(advice: dict[str, Any], candidates: list[Candidate]) -> tuple[list[Recommendation], list[str]]:
    by_id = {candidate.id: candidate for candidate in candidates}
    chosen, rejected_ids = [], []
    for item in sorted(advice["recommendations"], key=lambda r: r["priority"]):
        valid = [by_id[i] for i in item["candidate_ids"] if i in by_id]
        rejected_ids += [i for i in item["candidate_ids"] if i not in by_id]
        if valid:
            chosen.append(Recommendation(len(chosen) + 1, item["title_pt"], item["rationale_pt"], valid, item["macro_evidence_ids"]))
    return chosen, rejected_ids


def _driver(monthly: MonthlyReturns, asset, display_names: dict[str, str]) -> dict[str, str]:
    return {
        "asset": display_names.get(asset.label, asset.label),
        "return": pct(asset.return_pct, signed=True),
        "result": brl(asset.pnl, signed=True),
        "contribution": pp(monthly.contribution_pp(asset.pnl)),
    }


def _month_facts(monthly: MonthlyReturns, bench: Benchmarks | None, display_names: dict[str, str]) -> dict[str, Any]:
    total = monthly.total
    ranked = sorted(monthly.assets, key=lambda a: a.pnl, reverse=True)
    facts = {
        "return": pct(total.return_pct, signed=True),
        "result": brl(total.pnl, signed=True),
        "covers": f"ações e fundos, {pct(monthly.coverage_pct, 1)} do total investido",
        "not_covered": [display_names.get(p.label, p.label) for p in monthly.uncovered],
        "by_class": [
            {"class": CLASS_LABELS[name], "return": pct(agg.return_pct, signed=True),
             "result": brl(agg.pnl, signed=True), "contribution": pp(monthly.contribution_pp(agg.pnl))}
            for name, agg in monthly.by_class().items()
        ],
        "top_drivers": [_driver(monthly, asset, display_names) for asset in ranked[:3] if asset.pnl > 0],
        "detractors": [_driver(monthly, asset, display_names) for asset in ranked[::-1][:2] if asset.pnl < 0],
    }
    if bench:
        facts["benchmarks"] = _benchmark_facts(total, bench)
    return facts


def _benchmark_facts(total: Aggregate, bench: Benchmarks) -> dict[str, str]:
    facts = {}
    if bench.cdi_pct is not None:
        facts["cdi"] = pct(bench.cdi_pct, signed=True)
        facts["portfolio_vs_cdi"] = pp(total.return_pct - bench.cdi_pct)
    if bench.ibovespa_pct is not None:
        facts["ibovespa"] = pct(bench.ibovespa_pct, signed=True)
        facts["portfolio_vs_ibovespa"] = pp(total.return_pct - bench.ibovespa_pct)
    if bench.ipca_12m_pct is not None:
        facts["ipca_12_months"] = pct(bench.ipca_12m_pct)
        facts["ipca_12_months_through"] = month_year_pt(date.fromisoformat(bench.ipca_12m_through))
    return facts


def _macro_facts(macro: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": f"{macro['report_title']} (XP Macro Research, {macro['report_date']})",
        "headline": macro.get("headline_pt", ""),
        "projections": [{"indicator": p["indicator"], "value": p["value"], "horizon": p["horizon"]} for p in macro["projections"]],
        "themes": [{"title": t["title_pt"], "summary": t["summary_pt"]} for t in macro["themes"]],
        "risks": [r["summary_pt"] for r in macro["risks"]],
        "implications": [
            {"view": VIEW_LABELS.get(i["view"], i["view"]), "summary": i["summary_pt"]} for i in macro["implications"]
        ],
    }


def build_facts(
    statement: Statement,
    period: tuple[date, date],
    monthly: MonthlyReturns,
    since_start: dict[str, Aggregate],
    bench: Benchmarks | None,
    allocation: dict[str, Allocation],
    recommendations: list[Recommendation],
    macro: dict[str, Any],
    profile: dict[str, Any],
    display_names: dict[str, str],
) -> dict[str, Any]:
    return {
        "client": {"first_name": statement.first_name, "full_name": statement.client_name, "account": statement.account},
        "advisor": {"name": statement.advisor_name, "code": statement.advisor_code},
        "letter_date": long_date_pt(statement.statement_date),
        "period": {
            "start": date_br(period[0]), "end": date_br(period[1]),
            "label": f"de {date_br(period[0])} a {date_br(period[1])}",
        },
        "profile": {"label": profile["profile"], "horizon": profile["horizon"], "summary": profile["summary_pt"]},
        "wealth": {"net_worth": brl(statement.net_worth), "invested": brl(statement.invested), "cash_available": brl(statement.cash)},
        "month": _month_facts(monthly, bench, display_names),
        "since_start": [
            {"class": CLASS_LABELS[name], "return": pct(agg.return_pct, signed=True), "result": brl(agg.pnl, signed=True)}
            for name, agg in since_start.items()
        ],
        "allocation": [
            {"bucket": BUCKET_LABELS[a.bucket], "current": pct(a.pct, 1),
             "target_band": f"{a.band['min']}% a {a.band['max']}%", "status": a.status}
            for a in allocation.values()
        ],
        "recommendations": [
            {"priority": r.priority, "title": r.title, "rationale": r.rationale, "moves": r.lines()} for r in recommendations
        ],
        "macro": _macro_facts(macro),
    }
