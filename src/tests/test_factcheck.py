"""Testa o fact-check da carta: números dos FACTS passam; benchmark inventado, valor arredondado,
nome duplicado e nome de cliente errado são apontados."""
from xp_letter.factcheck import check_letter, figures

FACTS = {
    "month": {"return": "+2,51%", "pnl": "+R$ 6.650,48", "cdi": "+1,00%"},
    "macro": {"projections": [{"indicator": "Selic", "value": "15,50%"}, {"indicator": "Câmbio", "value": "6,20"}]},
    "recommendations": [{"amount": "R$ 40.000,00"}],
}


def _letter(performance: str) -> dict[str, str]:
    return {"greeting": "Prezado Albert,", "performance": performance, "closing": "Atenciosamente."}


def test_figures_ignore_dates_and_find_money_and_percent():
    text = "Em 07/05/2025 a carteira rendeu +2,51% (R$ 6.650,48), com Selic de 15,50% e dólar a 6,20."
    assert figures(text) == ["2,51%", "R$ 6.650,48", "15,50%", "6,20"]


def test_letter_using_only_facts_passes():
    result = check_letter(
        _letter("A carteira rendeu +2,51% no período, acima do CDI (+1,00%). Sugerimos aplicar R$ 40.000,00."),
        FACTS, "Albert",
    )
    assert result.passed


def test_invented_benchmark_gap_is_flagged():
    result = check_letter(_letter("O retorno foi de 3,5%, 0,2 p.p. abaixo do benchmark."), FACTS, "Albert")
    assert result.unsupported == ["0,2 p.p.", "3,5%"]


def test_rounded_money_is_flagged():
    result = check_letter(_letter("Sugerimos aplicar R$ 40 mil."), FACTS, "Albert")
    assert result.unsupported == ["R$ 40 mil"]


def test_duplicated_word_in_a_name_is_flagged():
    result = check_letter(_letter("O fundo Riza Lotus Plus Plus rendeu +2,51%."), FACTS, "Albert")
    assert result.issues == ['The words "Plus Plus" are duplicated; check the spelling of names against FACTS.']


def test_wrong_client_name_is_flagged():
    letter = {"greeting": "Prezado João,", "performance": "A carteira rendeu +2,51%."}
    assert not check_letter(letter, FACTS, "Albert").passed
