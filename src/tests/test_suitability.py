"""Testa o motor de recomendação: o CDB vencido conta como caixa, o excedente vai para as classes
abaixo do alvo (R$ 40 mil + R$ 40 mil + R$ 27 mil) e a troca de ações gera a estimativa de IR correta."""
import pytest

from xp_letter.config import load_config
from xp_letter.suitability import (
    current_allocation,
    deployable_amounts,
    rebalancing_candidates,
    stock_swap_candidates,
)


@pytest.fixture
def bands():
    return load_config("allocation_moderate")


@pytest.fixture
def shelf():
    return load_config("research_shelf")


@pytest.fixture
def registry():
    return load_config("fund_registry")["funds"]


def test_matured_cdb_counts_as_cash(statement, registry, bands):
    allocation = current_allocation(statement, registry, bands)
    assert allocation["cash"].value == pytest.approx(74672.62 + 40478.75)
    assert allocation["cash"].status == "acima"
    assert sum(a.value for a in allocation.values()) == pytest.approx(statement.net_worth)


def test_surplus_cash_goes_to_underweight_buckets(statement, registry, bands, shelf):
    allocation = current_allocation(statement, registry, bands)
    deploy = deployable_amounts(allocation, statement.net_worth, bands)
    candidates = {c.id: c.amount for c in rebalancing_candidates(deploy, bands, shelf)}
    assert candidates == {
        "reinvest_post_fixed": 40000,
        "reinvest_inflation_linked": 40000,
        "add_multimarket": 27000,
    }


def test_stock_swap_and_tax_note(statement, shelf, prices):
    candidates, tax = stock_swap_candidates(statement, shelf, prices, step=1000)
    assert {c.id for c in candidates} == {"sell_HAPV3", "sell_MRFG3", "buy_ITUB4", "buy_B3SA3"}
    assert tax.total_sales == pytest.approx(21572.63, abs=0.01)
    assert not tax.exempt
    assert tax.net == pytest.approx(-13345.11, abs=0.01)
