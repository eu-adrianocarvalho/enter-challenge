"""Gera os alertas de qualidade de dados que o assessor precisa ver antes de enviar a carta: CDB
vencido, caixa ocioso, variação atípica no mês, ticker renomeado, fundo transformado, cotas e research
defasados, crédito privado sem checagem de rating, concentração, retornos estimados e posições sem dado.
Cada alerta tem severidade; alguns trazem uma nota que o próprio código imprime na carta."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from xp_letter.formatting import brl, date_br, pct
from xp_letter.funds import FundReturn
from xp_letter.portfolio import Statement, parse_br_date
from xp_letter.returns import MonthlyReturns

HIGH, MEDIUM, INFO = "alta", "média", "info"


@dataclass(frozen=True)
class Flag:
    code: str
    severity: str
    message: str
    client_note: str | None = None


def matured_fixed_income(statement: Statement) -> list[Flag]:
    flags = []
    for position in statement.by_class("fixed_income"):
        maturity = parse_br_date(position.maturity_date)
        if maturity and maturity < statement.statement_date:
            flags.append(Flag(
                "MATURED_FIXED_INCOME", HIGH,
                f"{position.name} venceu em {date_br(maturity)}, mas o extrato de {date_br(statement.statement_date)} "
                f"ainda mostra posição de {brl(position.value)}. Confirmar a liquidação antes de reinvestir.",
                f"O {position.name} teve vencimento em {date_br(maturity)}; após confirmarmos a liquidação, "
                f"esses recursos fazem parte da sugestão de reaplicação.",
            ))
    return flags


def idle_cash(statement: Statement, threshold_pct: float) -> list[Flag]:
    matured = sum(p.value for p in statement.by_class("fixed_income") if _is_matured(p.maturity_date, statement))
    idle = statement.cash + matured
    share = idle / statement.net_worth * 100
    if share <= threshold_pct:
        return []
    return [Flag(
        "IDLE_CASH", HIGH,
        f"{brl(idle)} ({pct(share, 1)} do patrimônio) em saldo disponível e renda fixa vencida, sem rendimento.",
    )]


def _is_matured(maturity_text: str | None, statement: Statement) -> bool:
    maturity = parse_br_date(maturity_text)
    return bool(maturity and maturity < statement.statement_date)


def stale_quotes(statement: Statement, max_age_days: int) -> list[Flag]:
    stale = []
    for position in statement.positions:
        quote = parse_br_date(position.quote_date)
        if quote and (statement.statement_date - quote).days > max_age_days:
            stale.append((position.label, quote))
    if not stale:
        return []
    oldest = min(quote for _, quote in stale)
    return [Flag(
        "STALE_QUOTES", MEDIUM,
        f"{len(stale)} fundos com data da cota defasada (a mais antiga, {date_br(oldest)}, está "
        f"{(statement.statement_date - oldest).days} dias antes do extrato). O retorno do mês usa cotas da CVM.",
    )]


def renamed_tickers(statement: Statement, shelf: dict[str, Any]) -> list[Flag]:
    flags = []
    for position in statement.by_class("stock"):
        renamed = shelf["stocks"].get(position.ticker, {}).get("renamed_to")
        if renamed:
            flags.append(Flag(
                "RENAMED_TICKER", MEDIUM,
                f"{position.ticker} passou a negociar como {renamed}. Atualizar o cadastro do ativo.",
            ))
    return flags


def registry_notes(registry: list[dict[str, Any]]) -> list[Flag]:
    return [
        Flag("FUND_REGISTRY_CHANGE", MEDIUM, f"{fund['statement_name']}: {fund['registry_note']}")
        for fund in registry if fund.get("registry_note")
    ]


def large_monthly_moves(monthly: MonthlyReturns, threshold_pct: float) -> list[Flag]:
    return [
        Flag(
            "LARGE_MONTHLY_MOVE", MEDIUM,
            f"{asset.label} variou {pct(asset.return_pct, signed=True)} no período. Verificar evento corporativo "
            f"(grupamento, desdobramento, proventos) antes de enviar.",
        )
        for asset in monthly.assets if abs(asset.return_pct) > threshold_pct
    ]


def concentration(statement: Statement, threshold_pct: float) -> list[Flag]:
    return [
        Flag(
            "CONCENTRATION", INFO,
            f"{position.ticker} representa {pct(position.value / statement.net_worth * 100, 1)} do patrimônio.",
        )
        for position in statement.by_class("stock")
        if position.value / statement.net_worth * 100 > threshold_pct
    ]


def credit_rating_unverified(statement: Statement, registry: list[dict[str, Any]], min_rating: str | None) -> list[Flag]:
    credit_names = {fund["statement_name"] for fund in registry if fund.get("credit_private")}
    credit = [p for p in statement.by_class("fund") if p.name in credit_names]
    if not credit:
        return []
    share = sum(p.value for p in credit) / statement.net_worth * 100
    rule = f"rating mínimo {min_rating}" if min_rating else "a qualidade de crédito exigida pelo perfil"
    return [Flag(
        "CREDIT_RATING_UNVERIFIED", MEDIUM,
        f"{pct(share, 1)} do patrimônio em fundos de crédito privado ({', '.join(p.name for p in credit)}). "
        f"Confirmar se as carteiras respeitam {rule}.",
    )]


def research_age(report_date: date | None, statement: Statement, max_age_days: int) -> list[Flag]:
    if report_date is None or (statement.statement_date - report_date).days <= max_age_days:
        return []
    return [Flag(
        "STALE_RESEARCH", MEDIUM,
        f"O relatório macro é de {date_br(report_date)}, {(statement.statement_date - report_date).days} dias antes "
        f"do extrato. Em produção, usar a edição mais recente.",
    )]


def estimated_fund_returns(fund_returns: list[FundReturn]) -> list[Flag]:
    return [
        Flag("ESTIMATED_RETURN", INFO, f"{r.statement_name}: retorno do mês estimado. {r.method}.")
        for r in fund_returns if not r.method.startswith("Cota diária")
    ]


def uncovered_positions(monthly: MonthlyReturns) -> list[Flag]:
    if not monthly.uncovered:
        return []
    names = ", ".join(position.label for position in monthly.uncovered)
    return [Flag("NO_MONTHLY_DATA", INFO, f"Sem dado mensal confiável para: {names}. Fora do cálculo do mês.")]


def assess(
    statement: Statement,
    monthly: MonthlyReturns,
    fund_returns: list[FundReturn],
    registry: list[dict[str, Any]],
    shelf: dict[str, Any],
    thresholds: dict[str, float],
    report_date: date | None,
    min_credit_rating: str | None,
) -> list[Flag]:
    return [
        *matured_fixed_income(statement),
        *idle_cash(statement, thresholds["idle_cash_pct"]),
        *large_monthly_moves(monthly, thresholds["large_monthly_move_pct"]),
        *renamed_tickers(statement, shelf),
        *registry_notes(registry),
        *stale_quotes(statement, int(thresholds["stale_quote_days"])),
        *research_age(report_date, statement, int(thresholds["research_age_days"])),
        *credit_rating_unverified(statement, registry, min_credit_rating),
        *concentration(statement, thresholds["single_stock_pct"]),
        *estimated_fund_returns(fund_returns),
        *uncovered_positions(monthly),
    ]
