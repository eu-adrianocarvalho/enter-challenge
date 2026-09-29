"""Testa a formatação pt-BR de reais, percentuais, pontos percentuais e datas."""
from datetime import date

from xp_letter.formatting import brl, date_br, long_date_pt, pct, pp


def test_brl_uses_brazilian_separators():
    assert brl(386858.82) == "R$ 386.858,82"
    assert brl(1925.97, signed=True) == "+R$ 1.925,97"
    assert brl(-3023.04, signed=True) == "-R$ 3.023,04"


def test_pct_and_pp():
    assert pct(3.29889, signed=True) == "+3,30%"
    assert pct(-16.3814, signed=True) == "-16,38%"
    assert pct(6.1, decimals=1) == "6,1%"
    assert pp(0.6169) == "+0,62 p.p."


def test_rounding_to_zero_has_no_sign():
    assert pct(-0.001, signed=True) == "0,00%"


def test_dates():
    assert date_br(date(2025, 5, 7)) == "07/05/2025"
    assert long_date_pt(date(2025, 5, 7)) == "7 de maio de 2025"
