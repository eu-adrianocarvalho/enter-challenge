"""Orquestra a carta de um cliente em três etapas: analyze (extrai e valida extrato, perfil e macro;
calcula rentabilidade, alertas e candidatos), compose (recomendações e FACTS) e publish (escreve,
checa e revisa a carta em até 3 versões; gera DOCX, PDF, brief e logs).
Toda chamada de LLM passa por Context.graph, que registra tokens e custo."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from xp_letter.benchmarks import Benchmarks, benchmarks
from xp_letter.brief import BriefContext, render_brief
from xp_letter.charts import render_return_chart
from xp_letter.config import Settings, load_config, repo_path
from xp_letter.data_quality import Flag, assess
from xp_letter.facts import Recommendation, build_facts, recommendations_from_advice
from xp_letter.factcheck import FactCheckResult, check_letter
from xp_letter.funds import FundReturn, fund_returns
from xp_letter.grounding import GroundingReport, ground_outlook
from xp_letter.pdf_text import pdf_to_text
from xp_letter.portfolio import Check, Statement, parse_br_date, reconcile, statement_from_extraction
from xp_letter.prices import load_prices
from xp_letter.render import docx_to_pdf, page_count, render_docx
from xp_letter.returns import MonthlyReturns, compute_monthly_returns, since_start_by_class
from xp_letter.rivet_project import write_project
from xp_letter.rivet_runner import GraphRun, run_graph
from xp_letter.suitability import (
    BUCKET_LABELS, Allocation, Candidate, TaxNote, current_allocation, deployable_amounts, rebalancing_candidates,
    stock_swap_candidates,
)

ALLOCATION_FILES = {"moderado": "allocation_moderate"}
MAX_LETTER_ATTEMPTS = 3
READY = "PRONTA PARA REVISÃO DO ASSESSOR"
BLOCKED = "BLOQUEADA: resolver os itens que falharam antes de enviar"


class ReconciliationError(RuntimeError):
    def __init__(self, checks: list[Check]):
        failed = "\n".join(f"- {c.name}: {c.detail}" for c in checks if not c.passed)
        super().__init__(f"Extracted statement does not reconcile:\n{failed}")
        self.checks = checks


@dataclass(frozen=True)
class RunOptions:
    refresh_llm: bool = False
    refresh_market: bool = False
    make_pdf: bool = True


@dataclass
class Context:
    settings: Settings
    options: RunOptions
    runs: list[GraphRun]

    def graph(self, name: str, model_key: str, inputs: dict[str, str]) -> GraphRun:
        run = run_graph(self.settings, name, self.settings.raw["models"][model_key], inputs, self.options.refresh_llm)
        self.runs.append(run)
        return run


def _dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


@dataclass(frozen=True)
class Extraction:
    statement: Statement
    checks: list[Check]
    earlier_failures: list[Check]


def _reconciliation_feedback(failed: list[Check]) -> str:
    return "\n".join(f"- Check \"{c.name}\" failed: {c.detail}" for c in failed)


def extract_statement(ctx: Context) -> Extraction:
    text = pdf_to_text(ctx.settings.input_path("client", "portfolio_pdf"))
    thresholds = ctx.settings.thresholds
    corrections, earlier_failures = "(none)", []
    for _ in range(2):
        result = ctx.graph("extract_portfolio", "extraction", {"statement_text": text, "corrections": corrections}).result
        statement = statement_from_extraction(result)
        checks = reconcile(statement, thresholds["reconciliation_brl"], thresholds["reconciliation_pct"])
        failed = [check for check in checks if not check.passed]
        if not failed:
            return Extraction(statement, checks, earlier_failures)
        earlier_failures, corrections = failed, _reconciliation_feedback(failed)
    raise ReconciliationError(checks)


def extract_profile(ctx: Context) -> dict[str, Any]:
    text = ctx.settings.input_path("client", "risk_profile_txt").read_text(encoding="utf-8")
    return ctx.graph("extract_profile", "extraction", {"profile_text": text}).result


def macro_outlook(ctx: Context) -> tuple[dict[str, Any], GroundingReport]:
    text = pdf_to_text(ctx.settings.input_path("research", "macro_pdf"))
    return ground_outlook(ctx.graph("macro_outlook", "writing", {"report_text": text}).result, text)


def market_data(ctx: Context, registry: list[dict[str, Any]]) -> tuple[list[FundReturn], Benchmarks | None]:
    start, end = ctx.settings.period_start, ctx.settings.period_end
    suffix = f"{start.isoformat()}_{end.isoformat()}.json"
    market = ctx.settings.data_dir / "market"
    funds = fund_returns(registry, start, end, market / f"fund_returns_{suffix}", ctx.options.refresh_market)
    bench = benchmarks(start, end, market / f"benchmarks_{suffix}", ctx.options.refresh_market)
    return funds, bench


def _candidates_payload(candidates: list[Candidate]) -> list[dict[str, str]]:
    return [
        {"id": c.id, "action": c.action, "asset": c.asset, "bucket": BUCKET_LABELS[c.bucket], "rule": c.rule, "thesis": c.thesis}
        for c in candidates
    ]


def advise(ctx: Context, profile: dict, allocation_facts: list, candidates: list[Candidate], macro: dict) -> dict[str, Any]:
    inputs = {
        "profile_json": _dump(profile),
        "allocation_json": _dump(allocation_facts),
        "candidates_json": _dump(_candidates_payload(candidates)),
        "macro_json": _dump(macro),
    }
    return ctx.graph("advise", "writing", inputs).result


def _word_count(letter: dict[str, str]) -> int:
    return sum(len(str(value).split()) for value in letter.values())


@dataclass(frozen=True)
class LetterOutcome:
    letter: dict[str, str]
    factcheck: FactCheckResult
    review_issues: list[dict[str, str]]
    attempts: int

    @property
    def passed(self) -> bool:
        return self.factcheck.passed and not self.review_issues


def review_letter(ctx: Context, facts: dict, letter: dict[str, str]) -> list[dict[str, str]]:
    inputs = {"facts_json": _dump(facts), "letter_json": _dump(letter)}
    issues = ctx.graph("review_letter", "writing", inputs).result["issues"]
    return [issue for issue in issues if issue["severity"] == "major"]


def _letter_problems(check: FactCheckResult, majors: list[dict], letter: dict[str, str], word_budget: int) -> list[str]:
    problems = check.corrections().splitlines() if not check.passed else []
    problems += [f'- In {i["field"]}: "{i["excerpt"]}". {i["problem"]}' for i in majors]
    if _word_count(letter) > word_budget * 1.1:
        problems.append(f"- The draft has {_word_count(letter)} words; the limit is {word_budget}.")
    return problems


def write_checked_letter(ctx: Context, facts: dict, word_budget: int) -> LetterOutcome:
    corrections, attempts = "(none)", 0
    while True:
        attempts += 1
        inputs = {"facts_json": _dump(facts), "word_budget": str(word_budget), "corrections": corrections}
        letter = ctx.graph("write_letter", "writing", inputs).result
        check = check_letter(letter, facts, facts["client"]["first_name"])
        majors = review_letter(ctx, facts, letter)
        problems = _letter_problems(check, majors, letter, word_budget)
        if not problems or attempts == MAX_LETTER_ATTEMPTS:
            return LetterOutcome(letter, check, majors, attempts)
        corrections = "\n".join(problems)


def _output_paths(settings: Settings, statement: Statement) -> dict[str, Path]:
    stem = f"{settings.raw['client']['id']}_{statement.statement_date.isoformat()}"
    out = settings.output_dir
    return {
        "docx": out / f"carta_{stem}.docx", "chart": out / f"grafico_{stem}.png",
        "brief": out / f"brief_assessor_{stem}.md", "facts": out / f"facts_{stem}.json", "log": out / f"run_log_{stem}.json",
    }


@dataclass(frozen=True)
class Analysis:
    extraction: Extraction
    profile: dict[str, Any]
    macro: dict[str, Any]
    grounding: GroundingReport
    funds: list[FundReturn]
    bench: Benchmarks | None
    monthly: MonthlyReturns
    allocation: dict[str, Allocation]
    candidates: list[Candidate]
    tax: TaxNote | None
    flags: list[Flag]
    display_names: dict[str, str]

    @property
    def statement(self) -> Statement:
        return self.extraction.statement


def analyze(ctx: Context) -> Analysis:
    registry = load_config("fund_registry")["funds"]
    shelf = load_config("research_shelf")
    extraction = extract_statement(ctx)
    statement = extraction.statement
    profile = extract_profile(ctx)
    macro, grounding = macro_outlook(ctx)
    funds, bench = market_data(ctx, registry)
    prices = load_prices(ctx.settings.input_path("research", "prices_csv"))
    monthly = compute_monthly_returns(statement, prices, {f.statement_name: f.return_pct for f in funds})
    bands = load_config(ALLOCATION_FILES[profile["profile"]])
    allocation = current_allocation(statement, registry, bands)
    candidates = rebalancing_candidates(deployable_amounts(allocation, statement.net_worth, bands), bands, shelf)
    swaps, tax = stock_swap_candidates(statement, shelf, prices, bands["rounding_brl"])
    flags = assess(statement, monthly, funds, registry, shelf, ctx.settings.thresholds,
                   parse_br_date(macro.get("report_date")), profile.get("min_credit_rating"))
    display_names = {fund["statement_name"]: fund["display_name"] for fund in registry if fund.get("display_name")}
    return Analysis(extraction, profile, macro, grounding, funds, bench, monthly, allocation,
                    candidates + swaps, tax, flags, display_names)


def _facts(ctx: Context, a: Analysis, recommendations: list[Recommendation]) -> dict[str, Any]:
    period = (ctx.settings.period_start, ctx.settings.period_end)
    return build_facts(a.statement, period, a.monthly, since_start_by_class(a.statement), a.bench, a.allocation,
                       recommendations, a.macro, a.profile, a.display_names)


def compose(ctx: Context, a: Analysis) -> tuple[dict[str, Any], list[Recommendation], dict[str, Any]]:
    advice = advise(ctx, a.profile, _facts(ctx, a, [])["allocation"], a.candidates, a.macro)
    recommendations, _ = recommendations_from_advice(advice, a.candidates)
    return _facts(ctx, a, recommendations), recommendations, advice


def render_letter(ctx: Context, outcome: LetterOutcome, facts: dict, recs: list[Recommendation],
                  notes: list[str], paths: dict[str, Path]) -> tuple[Path | None, int | None]:
    logo = ctx.settings.input_path("brand", "logo")
    render_docx(outcome.letter, facts, recs, notes, paths["chart"], logo, paths["docx"])
    if not ctx.options.make_pdf:
        return None, None
    pdf = docx_to_pdf(paths["docx"])
    return pdf, page_count(pdf) if pdf else None


def publish(ctx: Context, a: Analysis, facts: dict, recs: list[Recommendation], advice: dict) -> Path:
    paths = _output_paths(ctx.settings, a.statement)
    ctx.settings.output_dir.mkdir(parents=True, exist_ok=True)
    render_return_chart(a.monthly, a.bench, paths["chart"])
    letter_cfg = ctx.settings.raw["letter"]
    notes = [flag.client_note for flag in a.flags if flag.client_note]
    outcome = write_checked_letter(ctx, facts, letter_cfg["word_budget"])
    pdf, pages = render_letter(ctx, outcome, facts, recs, notes, paths)
    if pages and pages > letter_cfg["max_pages"]:
        outcome = write_checked_letter(ctx, facts, letter_cfg["retry_word_budget"])
        pdf, pages = render_letter(ctx, outcome, facts, recs, notes, paths)
    ok = outcome.passed and (pages is None or pages <= letter_cfg["max_pages"])
    paths["facts"].write_text(_dump({"facts": facts, "letter": outcome.letter}), encoding="utf-8")
    paths["log"].write_text(_dump([asdict(r) | {"result": None} for r in ctx.runs]), encoding="utf-8")
    files = [p.name for p in (paths["docx"], pdf, paths["chart"], paths["facts"], paths["log"]) if p]
    brief = BriefContext(
        a.statement, READY if ok else BLOCKED, a.extraction.checks, a.extraction.earlier_failures, a.grounding,
        outcome.factcheck, outcome.review_issues, outcome.attempts, pages, a.flags, a.monthly, a.funds,
        a.allocation, recs, a.candidates, a.tax, advice.get("advisor_notes_pt", []), a.macro, ctx.runs, files,
    )
    paths["brief"].write_text(render_brief(brief), encoding="utf-8")
    return paths["brief"]


def run(settings: Settings, options: RunOptions) -> Path:
    load_dotenv(repo_path(".env"))
    write_project()
    ctx = Context(settings, options, runs=[])
    analysis = analyze(ctx)
    facts, recommendations, advice = compose(ctx, analysis)
    return publish(ctx, analysis, facts, recommendations, advice)
