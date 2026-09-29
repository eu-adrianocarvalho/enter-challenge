"""Confere se o resumo macro feito pelo LLM está ancorado no relatório da XP.
Cada projeção, tema e risco traz uma citação que precisa aparecer no texto do relatório (palavras em
ordem, tolerando quebras do PDF, mas nunca um número diferente). Os resumos só podem usar números que
existem no relatório. Itens sem base são descartados e listados no brief."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from xp_letter.factcheck import figures

TOKEN_PATTERN = re.compile(r"\w+(?:[.,]\w+)*")
YEAR_PATTERN = re.compile(r"(19|20)\d{2}")
WINDOW_SLACK = 1.6
MISSING_WORDS_ALLOWED = 0.1


def tokens(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFC", text).replace("-\n", "").lower()
    return TOKEN_PATTERN.findall(normalized)


def _is_number(word: str) -> bool:
    return any(char.isdigit() for char in word)


def _matches_from(source: list[str], start: int, quote: list[str]) -> bool:
    limit = min(len(source), start + int(len(quote) * WINDOW_SLACK) + 3)
    misses_left = int(len(quote) * MISSING_WORDS_ALLOWED)
    position = start
    for word in quote:
        found = next((i for i in range(position, limit) if source[i] == word), None)
        if found is not None:
            position = found + 1
        elif _is_number(word) or misses_left == 0:
            return False
        else:
            misses_left -= 1
    return True


def is_grounded(quote: str, source_tokens: list[str]) -> bool:
    quote_tokens = tokens(quote)
    if len(quote_tokens) < 3:
        return False
    return any(
        _matches_from(source_tokens, index, quote_tokens)
        for index, word in enumerate(source_tokens) if word == quote_tokens[0]
    )


@dataclass(frozen=True)
class GroundingReport:
    kept: int
    dropped: list[str]


def _value_in_quote(item: dict[str, Any]) -> bool:
    numbers = {word for word in tokens(item["value"]) if _is_number(word) and not YEAR_PATTERN.fullmatch(word)}
    return numbers <= set(tokens(item["quote"]))


def figures_supported(text: str, source_vocabulary: set[str]) -> bool:
    return all(set(tokens(figure)) <= source_vocabulary for figure in figures(text))


def _item_is_valid(section: str, item: dict[str, Any], source: list[str], vocabulary: set[str]) -> bool:
    written = " ".join(str(value) for key, value in item.items() if key.endswith("_pt"))
    if not is_grounded(item["quote"], source) or not figures_supported(written, vocabulary):
        return False
    return section != "projections" or _value_in_quote(item)


def ground_outlook(outlook: dict[str, Any], report_text: str) -> tuple[dict[str, Any], GroundingReport]:
    source = tokens(report_text)
    vocabulary = set(source)
    dropped: list[str] = []
    grounded = dict(outlook)
    for section in ("projections", "themes", "risks"):
        keep = []
        for item in outlook[section]:
            valid = _item_is_valid(section, item, source, vocabulary)
            (keep if valid else dropped).append(item if valid else item["id"])
        grounded[section] = keep
    valid_ids = {item["id"] for section in ("projections", "themes", "risks") for item in grounded[section]}
    grounded["implications"] = []
    for item in outlook["implications"]:
        if set(item["evidence_ids"]) & valid_ids and figures_supported(item["summary_pt"], vocabulary):
            grounded["implications"].append({**item, "evidence_ids": [e for e in item["evidence_ids"] if e in valid_ids]})
        else:
            dropped.append(item["id"])
    if not figures_supported(outlook.get("headline_pt", ""), vocabulary):
        grounded["headline_pt"] = ""
        dropped.append("headline_pt")
    kept = sum(len(grounded[s]) for s in ("projections", "themes", "risks", "implications"))
    return grounded, GroundingReport(kept=kept, dropped=dropped)
