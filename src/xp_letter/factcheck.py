"""Fact-check determinístico da carta: extrai todo percentual, valor em R$ e p.p. do texto e exige que
cada um exista, idêntico, no bloco FACTS (arredondamentos como "R$ 40 mil" são rejeitados).
Também confere a saudação com o nome do cliente, proíbe listas e aponta palavras duplicadas.
As falhas viram instruções de correção para a próxima versão da carta."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

DATE_PATTERN = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b")
FIGURE_PATTERN = re.compile(
    r"R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?(?:\s?(?:mil|milhões|milhão|bilhões|bi))?"
    r"|\d+(?:\.\d{3})*(?:,\d+)?\s?(?:%|p\.p\.)"
    r"|\d+,\d+"
)
REPEATED_WORD = re.compile(r"\b([A-Za-zÀ-ÿ]{3,})\s+\1\b", flags=re.IGNORECASE)


def _normalize(figure: str) -> str:
    return re.sub(r"\s+", "", figure).replace("−", "-").lstrip("+-")


def figures(text: str) -> list[str]:
    return [match.group(0) for match in FIGURE_PATTERN.finditer(DATE_PATTERN.sub(" ", text))]


def allowed_figures(facts: dict[str, Any]) -> set[str]:
    return {_normalize(figure) for figure in figures(json.dumps(facts, ensure_ascii=False))}


@dataclass(frozen=True)
class FactCheckResult:
    checked: int
    unsupported: list[str]
    issues: list[str]

    @property
    def passed(self) -> bool:
        return not self.unsupported and not self.issues

    def corrections(self) -> str:
        lines = [f'- The figure "{figure}" is not in FACTS. Remove it or replace it with a FACTS value.' for figure in self.unsupported]
        return "\n".join(lines + [f"- {issue}" for issue in self.issues])


def check_letter(letter: dict[str, str], facts: dict[str, Any], first_name: str) -> FactCheckResult:
    text = "\n".join(str(value) for value in letter.values())
    allowed = allowed_figures(facts)
    found = figures(text)
    unsupported = sorted({figure for figure in found if _normalize(figure) not in allowed})
    issues = []
    if first_name not in letter.get("greeting", ""):
        issues.append(f'The greeting must address the client by first name: "Prezado {first_name},".')
    if re.search(r"^\s*[-•*]\s", text, flags=re.MULTILINE):
        issues.append("Do not use bullet points; write paragraphs.")
    for repeated in sorted({m.group(0) for m in REPEATED_WORD.finditer(text)}):
        issues.append(f'The words "{repeated}" are duplicated; check the spelling of names against FACTS.')
    return FactCheckResult(checked=len(found), unsupported=unsupported, issues=issues)
