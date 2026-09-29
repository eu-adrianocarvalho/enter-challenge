"""Testa a ancoragem do macro: citações reais passam mesmo com quebras do PDF; citação inventada,
número alterado e resumo com número que não está no relatório são descartados."""
from xp_letter.grounding import ground_outlook, is_grounded, tokens

REPORT = """• O Copom manteve o tom duro, em resposta à alta das expectativas de inflação. Vemos a taxa Selic
terminal em 15,50%, com altas de 1,00-0,75-0,50 p.p. nas próximas três reuniões de política
• O ambiente global apresentou alguma melhora para o Brasil após recuperação moderada dos Caio Megale
Economista-chefe
preços das commodities e a decisão de Trump de adiar o aumento das tarifas de importação."""


def test_quote_across_line_break_is_grounded():
    assert is_grounded("Vemos a taxa Selic terminal em 15,50%", tokens(REPORT))


def test_quote_with_sidebar_words_interleaved_is_grounded():
    quote = "recuperação moderada dos preços das commodities e a decisão de Trump"
    assert is_grounded(quote, tokens(REPORT))


def test_invented_quote_is_not_grounded():
    assert not is_grounded("Vemos a taxa Selic terminal em 9%", tokens(REPORT))


def test_word_split_by_pdf_is_tolerated_but_a_changed_number_is_not():
    report = REPORT.replace("próximas", "pr óximas")
    quote = "Vemos a taxa Selic terminal em 15,50%, com altas de 1,00-0,75-0,50 p.p. nas próximas três reuniões de política"
    assert is_grounded(quote, tokens(report))
    assert not is_grounded(quote.replace("15,50%", "16,50%"), tokens(report))


def test_ungrounded_projection_and_orphan_implication_are_dropped():
    outlook = {
        "projections": [
            {"id": "P1", "indicator": "Selic", "value": "15,50%", "quote": "Vemos a taxa Selic terminal em 15,50%"},
            {"id": "P2", "indicator": "Selic", "value": "9%", "quote": "Selic deve se estabilizar em 9%"},
        ],
        "themes": [],
        "risks": [],
        "implications": [
            {"id": "I1", "evidence_ids": ["P1"]},
            {"id": "I2", "evidence_ids": ["P2"]},
        ],
    }
    for item in outlook["implications"]:
        item["summary_pt"] = "Juros altos favorecem o pós-fixado."
    grounded, report = ground_outlook(outlook, REPORT)
    assert [p["id"] for p in grounded["projections"]] == ["P1"]
    assert [i["id"] for i in grounded["implications"]] == ["I1"]
    assert report.dropped == ["P2", "I2"]


def test_qualitative_projection_with_year_horizon_is_kept():
    outlook = {
        "projections": [{"id": "P1", "indicator": "Juros EUA", "value": "sem cortes em 2025",
                         "quote": "Vemos a taxa Selic terminal em 15,50%, com altas de"}],
        "themes": [], "risks": [], "implications": [],
    }
    grounded, _ = ground_outlook(outlook, REPORT)
    assert [p["id"] for p in grounded["projections"]] == ["P1"]


def test_theme_summary_with_invented_figure_is_dropped():
    outlook = {
        "headline_pt": "Selic a 15,50% e inflação persistente.",
        "projections": [],
        "themes": [
            {"id": "T1", "title_pt": "Juros", "summary_pt": "O Copom deve levar a Selic a 15,50%.",
             "quote": "Vemos a taxa Selic terminal em 15,50%"},
            {"id": "T2", "title_pt": "Juros", "summary_pt": "A Selic cairá para 9% em 2025.",
             "quote": "Vemos a taxa Selic terminal em 15,50%"},
        ],
        "risks": [],
        "implications": [],
    }
    grounded, report = ground_outlook(outlook, REPORT)
    assert [t["id"] for t in grounded["themes"]] == ["T1"]
    assert grounded["headline_pt"] == "Selic a 15,50% e inflação persistente."
    assert report.dropped == ["T2"]
