"""Escreve o brief do assessor em Markdown: status da carta, resultado de cada checagem, alertas de
dados, rentabilidade por ativo, alocação vs. perfil, recomendações com as citações do research que as
sustentam, estimativa de IR, custo por etapa e arquivos gerados.
É o documento que o assessor lê e aprova antes de enviar a carta."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from xp_letter.data_quality import Flag
from xp_letter.facts import CLASS_LABELS, Recommendation
from xp_letter.factcheck import FactCheckResult
from xp_letter.formatting import brl, pct
from xp_letter.funds import FundReturn
from xp_letter.grounding import GroundingReport
from xp_letter.portfolio import Check, Statement
from xp_letter.returns import MonthlyReturns
from xp_letter.rivet_runner import GraphRun
from xp_letter.suitability import BUCKET_LABELS, Allocation, Candidate, TaxNote

SEVERITY_ORDER = {"alta": 0, "média": 1, "info": 2}


@dataclass(frozen=True)
class BriefContext:
    statement: Statement
    status: str
    checks: list[Check]
    earlier_failures: list[Check]
    grounding: GroundingReport
    factcheck: FactCheckResult
    review_issues: list[dict[str, str]]
    letter_attempts: int
    pages: int | None
    flags: list[Flag]
    monthly: MonthlyReturns
    fund_returns: list[FundReturn]
    allocation: dict[str, Allocation]
    recommendations: list[Recommendation]
    candidates: list[Candidate]
    tax: TaxNote | None
    advisor_notes: list[str]
    macro: dict[str, Any]
    runs: list[GraphRun]
    files: list[str]


def _mark(ok: bool) -> str:
    return "OK" if ok else "FALHOU"


def _checks_section(ctx: BriefContext) -> list[str]:
    failed = [c for c in ctx.checks if not c.passed]
    lines = [
        "## 1. Checagens automáticas",
        f"- Reconciliação do extrato extraído pelo LLM: {len(ctx.checks) - len(failed)}/{len(ctx.checks)} ({_mark(not failed)})",
        f"- Citações do relatório macro conferidas no texto original: {ctx.grounding.kept} mantidas, "
        f"{len(ctx.grounding.dropped)} descartadas {ctx.grounding.dropped or ''}",
        f"- Fact-check da carta: {ctx.factcheck.checked} números conferidos, {len(ctx.factcheck.unsupported)} sem fonte "
        f"({_mark(ctx.factcheck.passed)}; {ctx.letter_attempts} versão(ões) geradas)",
        f"- Revisão de fidelidade (LLM revisor): {len(ctx.review_issues)} apontamento(s) grave(s) na versão final "
        f"({_mark(not ctx.review_issues)})",
        f"- Páginas do PDF: {ctx.pages if ctx.pages is not None else 'PDF não gerado'}",
    ]
    lines += [f'  - {i["field"]}: "{i["excerpt"]}" ({i["problem"]})' for i in ctx.review_issues]
    if ctx.earlier_failures:
        lines.append("  - A 1ª transcrição falhou e foi refeita pelo LLM com o retorno das checagens:")
        lines += [f"    - {c.name} ({c.detail})" for c in ctx.earlier_failures]
    lines += [f"  - Reconciliação falhou: {c.name} ({c.detail})" for c in failed]
    lines += [f"  - Número sem fonte na carta: {figure}" for figure in ctx.factcheck.unsupported]
    return lines


def _flags_section(flags: list[Flag]) -> list[str]:
    lines = ["## 2. Alertas de dados", "| Severidade | Código | Alerta |", "|---|---|---|"]
    for flag in sorted(flags, key=lambda f: SEVERITY_ORDER[f.severity]):
        lines.append(f"| {flag.severity} | {flag.code} | {flag.message} |")
    return lines


def _returns_section(ctx: BriefContext) -> list[str]:
    methods = {r.statement_name: r.method for r in ctx.fund_returns}
    lines = [
        "## 3. Rentabilidade no período",
        f"Carteira coberta ({pct(ctx.monthly.coverage_pct, 1)} do investido): "
        f"{pct(ctx.monthly.total.return_pct, signed=True)}, {brl(ctx.monthly.total.pnl, signed=True)}.",
        "", "| Ativo | Classe | Retorno | Resultado | Fonte |", "|---|---|---|---|---|",
    ]
    for asset in sorted(ctx.monthly.assets, key=lambda a: a.pnl, reverse=True):
        source = methods.get(asset.label, asset.source)
        lines.append(f"| {asset.label} | {CLASS_LABELS[asset.asset_class]} | {pct(asset.return_pct, signed=True)} "
                     f"| {brl(asset.pnl, signed=True)} | {source} |")
    return lines


def _allocation_section(allocation: dict[str, Allocation]) -> list[str]:
    lines = ["## 4. Alocação vs. perfil", "| Bloco | Atual | Banda do perfil | Situação |", "|---|---|---|---|"]
    for a in allocation.values():
        lines.append(f"| {BUCKET_LABELS[a.bucket]} | {brl(a.value)} ({pct(a.pct, 1)}) | {a.band['min']}% a {a.band['max']}% | {a.status} |")
    return lines


def _evidence(macro: dict[str, Any], ids: list[str]) -> list[str]:
    quotes = {item["id"]: item["quote"] for section in ("projections", "themes", "risks") for item in macro[section]}
    readings = {item["id"]: item for item in macro["implications"]}
    lines = []
    for evidence_id in ids:
        if evidence_id in quotes:
            lines.append(f'  - {evidence_id}, citação do relatório: "{quotes[evidence_id]}"')
        elif evidence_id in readings:
            implication = readings[evidence_id]
            support = ", ".join(implication["evidence_ids"])
            lines.append(f"  - {evidence_id}, leitura do modelo apoiada em {support}: {implication['summary_pt']}")
    return lines


def _recommendations_section(ctx: BriefContext) -> list[str]:
    lines = ["## 5. Recomendações propostas (aprovar antes do envio)"]
    for rec in ctx.recommendations:
        lines.append(f"**{rec.priority}. {rec.title}**. {rec.rationale}")
        lines += [f"- {c.action.capitalize()} {c.asset}: {brl(c.amount)}. Regra: {c.rule}" for c in rec.candidates]
        lines.append("- Evidências do research:")
        lines += _evidence(ctx.macro, rec.evidence_ids)
    chosen = {c.id for rec in ctx.recommendations for c in rec.candidates}
    skipped = [c for c in ctx.candidates if c.id not in chosen]
    if skipped:
        lines.append("- Candidatos não usados na carta: " + ", ".join(f"{c.action} {c.asset} ({brl(c.amount)})" for c in skipped))
    if ctx.tax:
        lines.append(f"- IR: {ctx.tax.summary()}")
    lines += [f"- Nota do modelo: {note}" for note in ctx.advisor_notes]
    return lines


def _cost_section(runs: list[GraphRun]) -> list[str]:
    lines = ["## 6. Custo e rastreabilidade", "| Grafo | Modelo | Tokens (in/out) | Custo (US$) | Cache |", "|---|---|---|---|---|"]
    for run in runs:
        lines.append(f"| {run.graph} | {run.model} | {run.prompt_tokens}/{run.completion_tokens} | {run.cost_usd:.4f} | {'sim' if run.cached else 'não'} |")
    lines.append(f"| **Total** | | | **{sum(r.cost_usd for r in runs):.4f}** | |")
    return lines


def render_brief(ctx: BriefContext) -> str:
    s = ctx.statement
    parts = [
        f"# Brief do assessor: {s.client_name} (conta {s.account})",
        "", f"**Status: {ctx.status}**", "",
        f"Assessor: {s.advisor_name} ({s.advisor_code}) · Extrato de {s.statement_date.strftime('%d/%m/%Y')}",
        "", *_checks_section(ctx), "", *_flags_section(ctx.flags), "", *_returns_section(ctx), "",
        *_allocation_section(ctx.allocation), "", *_recommendations_section(ctx), "", *_cost_section(ctx.runs), "",
        "## 7. Arquivos gerados", *[f"- {f}" for f in ctx.files],
    ]
    return "\n".join(parts) + "\n"
