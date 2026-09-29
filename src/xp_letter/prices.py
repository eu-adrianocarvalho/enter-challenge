"""Lê o CSV de preços das ações (Input/profitability_calc_wip.csv): preço atual e do mês anterior.
Devolve um PricePair por ticker, com o retorno do período.
Usa o CSV em vez da planilha .xlsx do desafio, cujos números foram corrompidos pelo formato regional."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PricePair:
    ticker: str
    current: float
    previous: float

    @property
    def return_pct(self) -> float:
        return (self.current / self.previous - 1) * 100


def load_prices(path: Path) -> dict[str, PricePair]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return {
        row["Asset"].strip(): PricePair(
            ticker=row["Asset"].strip(),
            current=float(row["Current price"]),
            previous=float(row["Last month price"]),
        )
        for row in rows
    }
