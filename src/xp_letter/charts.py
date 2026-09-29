"""Desenha o gráfico da carta com matplotlib: retorno do período da carteira, das ações e dos fundos,
comparado com CDI e Ibovespa, em barras horizontais com rótulos em pt-BR.
Salva um PNG em Output/, que render.py insere no DOCX."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from xp_letter.benchmarks import Benchmarks
from xp_letter.facts import CLASS_LABELS
from xp_letter.formatting import pct
from xp_letter.returns import MonthlyReturns

PORTFOLIO_COLOR = "#FFC709"
CLASS_COLOR = "#1A1A1A"
BENCHMARK_COLOR = "#BDBDBD"
TEXT_COLOR = "#222222"


def _series(monthly: MonthlyReturns, bench: Benchmarks | None) -> list[tuple[str, float, str]]:
    series = [("Sua carteira", monthly.total.return_pct, PORTFOLIO_COLOR)]
    by_class = monthly.by_class()
    series += [(CLASS_LABELS[name].replace(" de investimento", ""), by_class[name].return_pct, CLASS_COLOR)
               for name in CLASS_LABELS if name in by_class]
    if bench and bench.cdi_pct is not None:
        series.append(("CDI", bench.cdi_pct, BENCHMARK_COLOR))
    if bench and bench.ibovespa_pct is not None:
        series.append(("Ibovespa", bench.ibovespa_pct, BENCHMARK_COLOR))
    return series


def render_return_chart(monthly: MonthlyReturns, bench: Benchmarks | None, target: Path) -> Path:
    series = _series(monthly, bench)[::-1]
    labels, values, colors = zip(*series)
    figure, axis = plt.subplots(figsize=(7.0, 0.32 * len(series) + 0.3), dpi=220)
    bars = axis.barh(labels, values, color=colors, height=0.62)
    span = max(abs(v) for v in values) or 1
    for bar, value in zip(bars, values):
        offset = span * 0.02 if value >= 0 else -span * 0.02
        axis.text(value + offset, bar.get_y() + bar.get_height() / 2, pct(value, signed=True),
                  va="center", ha="left" if value >= 0 else "right", fontsize=8, color=TEXT_COLOR)
    axis.axvline(0, color="#9CA3AF", linewidth=0.8)
    axis.set_xlim(min(0, min(values)) - span * 0.15, max(values) + span * 0.22)
    axis.xaxis.set_visible(False)
    for side in ("top", "right", "bottom", "left"):
        axis.spines[side].set_visible(False)
    axis.tick_params(axis="y", length=0, labelsize=8.5, colors=TEXT_COLOR)
    figure.tight_layout(pad=0.3)
    figure.savefig(target, transparent=False, facecolor="white")
    plt.close(figure)
    return target
