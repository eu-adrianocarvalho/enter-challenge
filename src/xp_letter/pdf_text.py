"""Extrai o texto dos PDFs de entrada (extrato e relatório macro) com pdfplumber, página por página.
Mantém cada linha de tabela em uma linha só, o que os .txt entregues no desafio não fazem.
É esse texto que os grafos de extração e de macro do Rivet recebem."""
from __future__ import annotations

from pathlib import Path

import pdfplumber


def pdf_to_text(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n\n".join(f"--- page {number} ---\n{text}" for number, text in enumerate(pages, start=1))
