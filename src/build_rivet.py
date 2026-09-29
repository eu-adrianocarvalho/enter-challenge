"""Gera rivet/xp_monthly_letter.rivet-project a partir de rivet/prompts e rivet/schemas.
Rode depois de editar qualquer prompt ou schema: python src/build_rivet.py.
Os inputs padrão de cada grafo vêm de data/rivet_inputs (última execução real), para que o
grafo rode direto no app do Rivet durante a demo."""
from xp_letter.rivet_project import write_project

if __name__ == "__main__":
    print(write_project())
