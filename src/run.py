"""Ponto de entrada da linha de comando: gera a carta mensal, o brief do assessor e atualiza o site.
Lê config/settings.yaml, executa o pipeline completo (xp_letter.pipeline.run), imprime o brief e
regenera docs/index.html para que as imagens da carta no site fiquem iguais ao PDF novo.
Opções: --refresh-llm (ignora respostas do LLM guardadas), --refresh-market (baixa de novo CVM, BCB e
Yahoo) e --no-pdf (não gera PDF nem site). Sai com código 1 se alguma etapa falhar."""
from __future__ import annotations

import argparse
import sys

from build_docs import build as build_site
from xp_letter.config import load_settings
from xp_letter.pipeline import ReconciliationError, RunOptions, run
from xp_letter.rivet_runner import RivetError


def parse_args() -> RunOptions:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-llm", action="store_true", help="ignore cached LLM answers and call the graphs again")
    parser.add_argument("--refresh-market", action="store_true", help="download CVM quotes and benchmarks again")
    parser.add_argument("--no-pdf", action="store_true", help="skip the PDF conversion and the site rebuild")
    args = parser.parse_args()
    return RunOptions(refresh_llm=args.refresh_llm, refresh_market=args.refresh_market, make_pdf=not args.no_pdf)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    options = parse_args()
    try:
        brief = run(load_settings(), options)
    except (ReconciliationError, RivetError, FileNotFoundError) as error:
        print(error, file=sys.stderr)
        return 1
    print(brief.read_text(encoding="utf-8"))
    if options.make_pdf:
        print(f"Site de documentação atualizado: {build_site()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
