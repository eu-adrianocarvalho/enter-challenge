"""Fixtures compartilhadas pelos testes: o extrato do Albert transcrito à mão do PDF
(fixtures/albert_statement.json, usado como gabarito) e o CSV de preços do desafio."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from xp_letter.config import repo_path
from xp_letter.portfolio import Statement, statement_from_extraction
from xp_letter.prices import PricePair, load_prices

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def statement_data() -> dict:
    return json.loads((FIXTURES / "albert_statement.json").read_text(encoding="utf-8"))


@pytest.fixture
def statement(statement_data: dict) -> Statement:
    return statement_from_extraction(statement_data)


@pytest.fixture
def prices() -> dict[str, PricePair]:
    return load_prices(repo_path("Input/profitability_calc_wip.csv"))
