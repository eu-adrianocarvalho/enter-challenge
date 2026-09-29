"""Formata valores no padrão brasileiro: reais (R$ 1.234,56), percentuais (+3,30%), pontos
percentuais (+1,51 p.p.) e datas (07/05/2025, 7 de maio de 2025).
Todo número mostrado ao cliente passa por aqui. O fact-check compara a carta com essas mesmas
strings, por isso cada número tem um único formato."""
from __future__ import annotations

from datetime import date

MONTHS_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _group_thousands(value: float, decimals: int) -> str:
    us_style = f"{abs(value):,.{decimals}f}"
    return us_style.replace(",", "_").replace(".", ",").replace("_", ".")


def _sign(value: float, signed: bool) -> str:
    if value < 0:
        return "-"
    return "+" if signed and value > 0 else ""


def brl(value: float, signed: bool = False) -> str:
    rounded = round(value, 2)
    return f"{_sign(rounded, signed)}R$ {_group_thousands(rounded, 2)}"


def pct(value: float, decimals: int = 2, signed: bool = False) -> str:
    rounded = round(value, decimals)
    return f"{_sign(rounded, signed)}{_group_thousands(rounded, decimals)}%"


def pp(value: float, decimals: int = 2) -> str:
    rounded = round(value, decimals)
    return f"{_sign(rounded, True)}{_group_thousands(rounded, decimals)} p.p."


def date_br(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def month_year_pt(value: date) -> str:
    return f"{MONTHS_PT[value.month - 1]} de {value.year}"


def long_date_pt(value: date) -> str:
    return f"{value.day} de {MONTHS_PT[value.month - 1]} de {value.year}"
