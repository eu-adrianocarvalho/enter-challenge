"""Testa a reconciliação do extrato: o gabarito fecha, e um dígito trocado ou um saldo errado são detectados."""
from xp_letter.portfolio import reconcile, statement_from_extraction


def _failures(statement):
    return [check for check in reconcile(statement, tolerance_brl=0.05, tolerance_pct=0.5) if not check.passed]


def test_golden_statement_reconciles(statement):
    assert _failures(statement) == []


def test_swapped_digits_in_a_position_are_caught(statement_data):
    statement_data["positions"][0]["value"] = 28712.04
    failed = {check.name for check in _failures(statement_from_extraction(statement_data))}
    assert "posições de stock = subtotal" in failed
    assert "LREN3: quantidade × preço = posição" in failed


def test_wrong_cash_is_caught(statement_data):
    statement_data["cash"] = 7467.26
    failed = {check.name for check in _failures(statement_from_extraction(statement_data))}
    assert failed == {"investido + saldo = patrimônio"}
