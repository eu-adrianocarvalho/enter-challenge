"""Calcula a rentabilidade: retorno do período por ativo, por classe e da carteira, e o resultado
desde a aplicação por classe.
Ações usam quantidade × preços do CSV; fundos usam o retorno da cota da CVM aplicado à posição.
Posições sem dado confiável (o CDB vencido) ficam de fora, e a cobertura (% do investido) é informada."""
from __future__ import annotations

from dataclasses import dataclass

from xp_letter.portfolio import Position, Statement
from xp_letter.prices import PricePair


@dataclass(frozen=True)
class AssetReturn:
    label: str
    asset_class: str
    start_value: float
    end_value: float
    source: str

    @property
    def pnl(self) -> float:
        return self.end_value - self.start_value

    @property
    def return_pct(self) -> float:
        return (self.end_value / self.start_value - 1) * 100


@dataclass(frozen=True)
class Aggregate:
    name: str
    start_value: float
    end_value: float

    @property
    def pnl(self) -> float:
        return self.end_value - self.start_value

    @property
    def return_pct(self) -> float:
        return (self.end_value / self.start_value - 1) * 100 if self.start_value else 0.0


@dataclass(frozen=True)
class MonthlyReturns:
    assets: list[AssetReturn]
    uncovered: list[Position]
    invested: float

    @property
    def total(self) -> Aggregate:
        return _aggregate("portfolio", self.assets)

    @property
    def coverage_pct(self) -> float:
        return sum(asset.end_value for asset in self.assets) / self.invested * 100

    def by_class(self) -> dict[str, Aggregate]:
        classes = sorted({asset.asset_class for asset in self.assets})
        return {name: _aggregate(name, [a for a in self.assets if a.asset_class == name]) for name in classes}

    def contribution_pp(self, pnl: float) -> float:
        return pnl / self.total.start_value * 100


def _aggregate(name: str, assets: list[AssetReturn]) -> Aggregate:
    return Aggregate(name, sum(a.start_value for a in assets), sum(a.end_value for a in assets))


def _stock_return(position: Position, prices: dict[str, PricePair]) -> AssetReturn | None:
    pair = prices.get(position.ticker or "")
    if pair is None or position.quantity is None:
        return None
    return AssetReturn(
        label=position.label,
        asset_class=position.asset_class,
        start_value=position.quantity * pair.previous,
        end_value=position.quantity * pair.current,
        source="preços de fechamento (CSV)",
    )


def _fund_return(position: Position, fund_returns_pct: dict[str, float]) -> AssetReturn | None:
    monthly_pct = fund_returns_pct.get(position.name)
    if monthly_pct is None:
        return None
    return AssetReturn(
        label=position.label,
        asset_class=position.asset_class,
        start_value=position.value / (1 + monthly_pct / 100),
        end_value=position.value,
        source="cotas diárias CVM",
    )


def compute_monthly_returns(
    statement: Statement,
    prices: dict[str, PricePair],
    fund_returns_pct: dict[str, float],
) -> MonthlyReturns:
    assets, uncovered = [], []
    for position in statement.positions:
        if position.asset_class == "stock":
            result = _stock_return(position, prices)
        elif position.asset_class == "fund":
            result = _fund_return(position, fund_returns_pct)
        else:
            result = None
        if result is None:
            uncovered.append(position)
        else:
            assets.append(result)
    return MonthlyReturns(assets=assets, uncovered=uncovered, invested=statement.invested)


def since_start_by_class(statement: Statement) -> dict[str, Aggregate]:
    result = {}
    for asset_class in statement.class_totals:
        positions = [p for p in statement.by_class(asset_class) if p.cost_basis is not None]
        result[asset_class] = Aggregate(
            asset_class,
            sum(p.cost_basis for p in positions),
            sum(p.value for p in positions),
        )
    return result
