"""Testa a rentabilidade: ações +3,30% (+R$ 1.925,97) no período, retorno de cada ação, cobertura
sem cotas de fundos, peso dos fundos no cálculo e resultado desde a aplicação por classe."""
import pytest

from xp_letter.returns import compute_monthly_returns, since_start_by_class


def test_stock_sleeve_monthly_return(statement, prices):
    returns = compute_monthly_returns(statement, prices, fund_returns_pct={})
    stocks = returns.by_class()["stock"]
    assert stocks.start_value == pytest.approx(58382.08, abs=0.01)
    assert stocks.end_value == pytest.approx(60308.05, abs=0.01)
    assert stocks.pnl == pytest.approx(1925.97, abs=0.01)
    assert stocks.return_pct == pytest.approx(3.2989, abs=0.0001)


def test_per_stock_returns(statement, prices):
    returns = compute_monthly_returns(statement, prices, fund_returns_pct={})
    by_label = {asset.label: round(asset.return_pct, 2) for asset in returns.assets}
    assert by_label == {"LREN3": 8.94, "MRFG3": -16.38, "ARZZ3": 0.05, "HAPV3": 76.44}


def test_funds_without_quotes_are_uncovered(statement, prices):
    returns = compute_monthly_returns(statement, prices, fund_returns_pct={})
    assert len(returns.uncovered) == 8
    assert returns.coverage_pct == pytest.approx(60308.05 / 312186.20 * 100)


def test_fund_quote_return_is_weighted_by_position(statement, prices):
    returns = compute_monthly_returns(
        statement, prices, fund_returns_pct={"Riza Lotus Plus Advisory FIC FIRF REF DI CP": 1.0}
    )
    fund = returns.by_class()["fund"]
    assert fund.end_value == pytest.approx(96178.73)
    assert fund.return_pct == pytest.approx(1.0)


def test_since_start_by_class(statement):
    result = since_start_by_class(statement)
    assert result["stock"].return_pct == pytest.approx(-38.74, abs=0.01)
    assert result["fund"].return_pct == pytest.approx(11.15, abs=0.01)
    assert result["fixed_income"].return_pct == pytest.approx(34.93, abs=0.01)
