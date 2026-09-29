"""Compara a alocação atual com as faixas do perfil (config/allocation_moderate.yaml) e gera os candidatos
de compra e venda com valor em reais: reaplicar o caixa excedente nas classes abaixo do alvo e trocar
ações fora do perfil por pagadoras de dividendos (config/research_shelf.yaml).
Também estima o IR das vendas. O LLM só escolhe e explica esses candidatos; nunca define valores."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from xp_letter.formatting import brl
from xp_letter.portfolio import Position, Statement, parse_br_date
from xp_letter.prices import PricePair

BUCKET_LABELS = {
    "fixed_income": "Renda fixa",
    "multimarket": "Multimercado",
    "equities": "Renda variável",
    "cash": "Caixa e vencidos",
}
INVESTABLE_BUCKETS = ("fixed_income", "multimarket", "equities")
STOCK_SALE_EXEMPTION_BRL = 20_000.0


@dataclass(frozen=True)
class Allocation:
    bucket: str
    value: float
    pct: float
    band: dict[str, float]

    @property
    def status(self) -> str:
        if self.pct < self.band["min"]:
            return "abaixo"
        return "acima" if self.pct > self.band["max"] else "dentro"


@dataclass(frozen=True)
class Candidate:
    id: str
    action: str
    asset: str
    amount: float
    bucket: str
    rule: str
    thesis: str


@dataclass(frozen=True)
class TaxNote:
    total_sales: float
    realized: dict[str, float]

    @property
    def net(self) -> float:
        return sum(self.realized.values())

    @property
    def exempt(self) -> bool:
        return self.total_sales <= STOCK_SALE_EXEMPTION_BRL

    def summary(self) -> str:
        parts = ", ".join(f"{ticker} {brl(value, signed=True)}" for ticker, value in self.realized.items())
        if self.exempt:
            return f"Vendas de {brl(self.total_sales)} no mês ficam na isenção de {brl(STOCK_SALE_EXEMPTION_BRL)}."
        outcome = "sem IR a pagar" if self.net <= 0 else f"IR de 15% sobre {brl(self.net)}"
        carry = f"; prejuízo de {brl(-self.net)} a compensar no futuro" if self.net < 0 else ""
        return (
            f"Vendas de {brl(self.total_sales)} superam a isenção mensal de {brl(STOCK_SALE_EXEMPTION_BRL)}. "
            f"Resultado realizado: {parts}. Saldo {brl(self.net, signed=True)}, {outcome}{carry}. "
            f"Estimativa; confirmar com a área tributária."
        )


def bucket_of(position: Position, fund_buckets: dict[str, str], statement: Statement) -> str:
    if position.asset_class == "stock":
        return "equities"
    if position.asset_class == "fund":
        return fund_buckets.get(position.name, "multimarket")
    maturity = parse_br_date(position.maturity_date)
    return "cash" if maturity and maturity < statement.statement_date else "fixed_income"


def current_allocation(statement: Statement, registry: list[dict[str, Any]], bands: dict[str, Any]) -> dict[str, Allocation]:
    fund_buckets = {fund["statement_name"]: fund["bucket"] for fund in registry}
    values = {bucket: 0.0 for bucket in BUCKET_LABELS}
    values["cash"] += statement.cash
    for position in statement.positions:
        values[bucket_of(position, fund_buckets, statement)] += position.value
    return {
        bucket: Allocation(bucket, value, value / statement.net_worth * 100, bands["buckets"][bucket])
        for bucket, value in values.items()
    }


def _round_down(value: float, step: float) -> float:
    return math.floor(value / step) * step


def deployable_amounts(allocation: dict[str, Allocation], net_worth: float, bands: dict[str, Any]) -> dict[str, float]:
    surplus = allocation["cash"].value - net_worth * bands["buckets"]["cash"]["target"] / 100
    if surplus <= 0:
        return {}
    gaps = {
        bucket: max(0.0, net_worth * allocation[bucket].band["target"] / 100 - allocation[bucket].value)
        for bucket in INVESTABLE_BUCKETS
    }
    scale = min(1.0, surplus / sum(gaps.values())) if sum(gaps.values()) else 0.0
    deploy = {bucket: gap * scale for bucket, gap in gaps.items() if gap > 0}
    leftover = surplus - sum(deploy.values())
    deploy[bands["surplus_bucket"]] = deploy.get(bands["surplus_bucket"], 0.0) + leftover
    return deploy


def rebalancing_candidates(deploy: dict[str, float], bands: dict[str, Any], shelf: dict[str, Any]) -> list[Candidate]:
    step = bands["rounding_brl"]
    split = bands["fixed_income_split"]
    legs = []
    if "fixed_income" in deploy:
        legs += [("reinvest_post_fixed", "post_fixed", deploy["fixed_income"] * split["post_fixed"])]
        legs += [("reinvest_inflation_linked", "inflation_linked", deploy["fixed_income"] * split["inflation_linked"])]
    if "multimarket" in deploy:
        legs += [("add_multimarket", "multimarket", deploy["multimarket"])]
    candidates = []
    for candidate_id, product_key, amount in legs:
        product = shelf["products"][product_key]
        rounded = _round_down(amount, step)
        if rounded >= step:
            candidates.append(Candidate(
                candidate_id, "aplicar", product["name"], rounded, product["bucket"],
                f"Caixa e renda fixa vencida acima da banda; leva {BUCKET_LABELS[product['bucket']]} para o alvo do perfil.",
                product["thesis"],
            ))
    return candidates


def stock_swap_candidates(
    statement: Statement, shelf: dict[str, Any], prices: dict[str, PricePair], step: float
) -> tuple[list[Candidate], TaxNote | None]:
    misfits = [p for p in statement.by_class("stock") if not shelf["stocks"].get(p.ticker, {}).get("profile_fit", True)]
    if not misfits:
        return [], None
    sale_values = {p.ticker: p.quantity * prices[p.ticker].current for p in misfits}
    sells = [
        Candidate(
            f"sell_{p.ticker}", "vender", p.ticker, sale_values[p.ticker], "equities",
            "Ação fora do perfil moderado (não é pagadora consistente de dividendos).",
            "o perfil prevê ações de empresas consolidadas que pagam dividendos",
        )
        for p in misfits
    ]
    buy_list = [ticker for ticker, info in shelf["stocks"].items() if info.get("buy_list")]
    per_buy = _round_down(sum(sale_values.values()) / len(buy_list), step)
    buys = [
        Candidate(
            f"buy_{ticker}", "comprar", ticker, per_buy, "equities",
            "Reposição com os recursos das vendas, sem alterar o peso de renda variável.",
            "empresa consolidada e pagadora de dividendos, alinhada ao perfil",
        )
        for ticker in buy_list if per_buy >= step
    ]
    realized = {p.ticker: p.quantity * (prices[p.ticker].current - p.average_price) for p in misfits}
    return sells + buys, TaxNote(sum(sale_values.values()), realized)
