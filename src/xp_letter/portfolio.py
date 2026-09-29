"""Modelo do extrato do cliente (Statement e Position) e as checagens de reconciliação.
Converte o JSON extraído pelo LLM em objetos e confere se tudo fecha: investido + saldo = patrimônio,
posições = subtotal de cada classe, quantidade × preço = posição e % de alocação.
Se alguma checagem falhar, o pipeline pede uma nova transcrição; se persistir, a carta é bloqueada."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

ASSET_CLASSES = ("stock", "fund", "fixed_income")


@dataclass(frozen=True)
class Position:
    asset_class: str
    name: str
    ticker: str | None
    value: float
    allocation_pct: float
    return_since_start_pct: float | None
    start_date: str | None
    invested_amount: float | None
    net_value: float | None
    average_price: float | None
    last_price: float | None
    quantity: float | None
    quote_date: str | None
    rate: str | None
    maturity_date: str | None

    @property
    def label(self) -> str:
        return self.ticker or self.name

    @property
    def cost_basis(self) -> float | None:
        if self.quantity is not None and self.average_price is not None:
            return self.quantity * self.average_price
        return self.invested_amount


@dataclass(frozen=True)
class Statement:
    client_name: str
    account: str
    statement_date: date
    advisor_code: str
    advisor_name: str
    net_worth: float
    invested: float
    cash: float
    class_totals: dict[str, tuple[float, float]]
    positions: list[Position]

    @property
    def first_name(self) -> str:
        return self.client_name.split()[0]

    def by_class(self, asset_class: str) -> list[Position]:
        return [position for position in self.positions if position.asset_class == asset_class]


@dataclass(frozen=True)
class Check:
    name: str
    passed: bool
    detail: str


def parse_br_date(text: str | None) -> date | None:
    if not text:
        return None
    return datetime.strptime(text.strip(), "%d/%m/%Y").date()


def statement_from_extraction(data: dict[str, Any]) -> Statement:
    positions = [Position(**{**raw, "ticker": raw.get("ticker") or None}) for raw in data["positions"]]
    return Statement(
        client_name=data["client_name"],
        account=data["account"],
        statement_date=parse_br_date(data["statement_date"]),
        advisor_code=data["advisor_code"],
        advisor_name=data["advisor_name"],
        net_worth=data["net_worth"],
        invested=data["invested"],
        cash=data["cash"],
        class_totals={row["asset_class"]: (row["subtotal"], row["allocation_pct"]) for row in data["class_totals"]},
        positions=positions,
    )


def _close(actual: float, expected: float, tolerance: float) -> bool:
    return abs(actual - expected) <= tolerance


def _relative_gap_pct(actual: float, expected: float) -> float:
    return abs(actual / expected - 1) * 100 if expected else float("inf")


def _check_totals(statement: Statement, tolerance_brl: float) -> list[Check]:
    subtotal_sum = sum(subtotal for subtotal, _ in statement.class_totals.values())
    return [
        Check(
            "investido + saldo = patrimônio",
            _close(statement.invested + statement.cash, statement.net_worth, tolerance_brl),
            f"{statement.invested:.2f} + {statement.cash:.2f} vs {statement.net_worth:.2f}",
        ),
        Check(
            "soma das classes = investido",
            _close(subtotal_sum, statement.invested, tolerance_brl),
            f"{subtotal_sum:.2f} vs {statement.invested:.2f}",
        ),
    ]


def _check_class_subtotals(statement: Statement, tolerance_brl: float) -> list[Check]:
    checks = []
    for asset_class, (subtotal, _) in statement.class_totals.items():
        position_sum = sum(position.value for position in statement.by_class(asset_class))
        checks.append(Check(
            f"posições de {asset_class} = subtotal",
            _close(position_sum, subtotal, tolerance_brl),
            f"{position_sum:.2f} vs {subtotal:.2f}",
        ))
    return checks


def _check_position(position: Position, statement: Statement, tolerance_pct: float) -> list[Check]:
    checks = []
    if position.quantity is not None and position.last_price is not None:
        implied = position.quantity * position.last_price
        checks.append(Check(
            f"{position.label}: quantidade × preço = posição",
            _relative_gap_pct(implied, position.value) <= tolerance_pct,
            f"{implied:.2f} vs {position.value:.2f}",
        ))
    elif position.invested_amount and position.return_since_start_pct is not None:
        implied = position.invested_amount * (1 + position.return_since_start_pct / 100)
        checks.append(Check(
            f"{position.label}: aplicado × (1 + rentabilidade) = posição",
            _relative_gap_pct(implied, position.value) <= tolerance_pct,
            f"{implied:.2f} vs {position.value:.2f}",
        ))
    implied_allocation = position.value / statement.invested * 100
    checks.append(Check(
        f"{position.label}: % alocação",
        _close(implied_allocation, position.allocation_pct, 0.05),
        f"{implied_allocation:.2f}% vs {position.allocation_pct:.2f}%",
    ))
    return checks


def reconcile(statement: Statement, tolerance_brl: float, tolerance_pct: float) -> list[Check]:
    checks = _check_totals(statement, tolerance_brl) + _check_class_subtotals(statement, tolerance_brl)
    for position in statement.positions:
        checks.extend(_check_position(position, statement, tolerance_pct))
    return checks
