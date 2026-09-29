"""Gera docs/relatorio.pdf, o relatório curto exigido pelo desafio (até 2 páginas): problemas da v1,
racional da solução e próximos passos. O texto fica em docs/relatorio.md; este script converte o
Markdown em HTML com o visual da Enter e usa uma instância separada do Word para salvar em PDF.
Rode depois de editar o relatório: python src/build_report.py (avisa se passar de 2 páginas)."""
from __future__ import annotations

import sys
from pathlib import Path

import markdown
import pythoncom
import win32com.client
from pypdf import PdfReader

from xp_letter.config import REPO_ROOT

SOURCE = REPO_ROOT / "docs" / "relatorio.md"
TARGET = REPO_ROOT / "docs" / "relatorio.pdf"
MAX_PAGES = 2
WORD_PDF_FORMAT = 17
CSS = """
@page { size: 21cm 29.7cm; margin: 1.4cm 1.7cm; }
body { font-family: Calibri, sans-serif; font-size: 9pt; line-height: 1.15; color: #000000; }
h1 { font-family: Georgia, serif; font-weight: normal; font-size: 16pt; margin: 0 0 4pt 0; }
h2 { page-break-after: avoid; font-family: Georgia, serif; font-weight: normal; font-size: 12pt; margin: 8pt 0 3pt 0;
  border-bottom: 2px solid #ffae35; }
p { margin: 2pt 0 3pt 0; text-align: justify; }
a { color: #000000; }
ul { margin-top: 0; margin-bottom: 2pt; margin-left: 12pt; padding-left: 0; } li { margin: 0 0 1pt 0; }
table { border-collapse: collapse; width: 100%; font-size: 8pt; margin: 3pt 0 4pt 0; }
th { background: #171717; color: #ffffff; text-align: left; padding: 1pt 3pt; }
td { border: 1px solid #cecece; padding: 1pt 3pt; vertical-align: top; line-height: 1.05; margin: 0; }
"""


def to_html(source: Path) -> str:
    body = markdown.markdown(source.read_text(encoding="utf-8"), extensions=["tables"])
    return f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>"


def html_to_pdf(html: str, target: Path) -> None:
    staging = target.with_suffix(".html")
    staging.write_text(html, encoding="utf-8")
    pythoncom.CoInitialize()
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible, word.DisplayAlerts = False, 0
    try:
        document = word.Documents.Open(str(staging.resolve()), ReadOnly=True)
        document.SaveAs(str(target.resolve()), FileFormat=WORD_PDF_FORMAT)
        document.Close(False)
    finally:
        word.Quit()
        pythoncom.CoUninitialize()
        staging.unlink(missing_ok=True)


def build() -> int:
    html_to_pdf(to_html(SOURCE), TARGET)
    pages = len(PdfReader(str(TARGET)).pages)
    print(f"{TARGET} · {pages} página(s)")
    return 0 if pages <= MAX_PAGES else 1


if __name__ == "__main__":
    sys.exit(build())
