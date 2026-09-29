"""Busca os benchmarks do mesmo período da carteira: CDI (Banco Central, série SGS 12, capitalizada
dia a dia), IPCA em 12 meses (série 433, até o último mês já publicado) e Ibovespa (Yahoo Finance, ^BVSP).
Salva o resultado em data/market/ para que a próxima execução funcione offline e dê o mesmo número.
Sem internet e sem arquivo salvo, a carta sai sem a comparação."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import requests

SGS_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados"
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP"
CDI_DAILY_SERIES = 12
IPCA_MONTHLY_SERIES = 433
IPCA_PUBLICATION_LAG_DAYS = 10


@dataclass(frozen=True)
class Benchmarks:
    period_start: str
    period_end: str
    cdi_pct: float | None
    ibovespa_pct: float | None
    ipca_12m_pct: float | None
    ipca_12m_through: str | None
    source: str


def _sgs(series: int, start: date, end: date) -> list[tuple[date, float]]:
    params = {"formato": "json", "dataInicial": start.strftime("%d/%m/%Y"), "dataFinal": end.strftime("%d/%m/%Y")}
    response = requests.get(SGS_URL.format(series=series), params=params, timeout=30)
    response.raise_for_status()
    return [(datetime.strptime(row["data"], "%d/%m/%Y").date(), float(row["valor"])) for row in response.json()]


def _compound_pct(rates_pct: list[float]) -> float:
    factor = 1.0
    for rate in rates_pct:
        factor *= 1 + rate / 100
    return (factor - 1) * 100


def cdi_period_pct(start: date, end: date) -> float:
    daily = _sgs(CDI_DAILY_SERIES, start, end)
    return _compound_pct([rate for day, rate in daily if start <= day < end])


def _last_published_ipca_month(as_of: date) -> date:
    candidate = date(as_of.year, as_of.month, 1) - timedelta(days=1)
    while candidate + timedelta(days=IPCA_PUBLICATION_LAG_DAYS) > as_of:
        candidate = date(candidate.year, candidate.month, 1) - timedelta(days=1)
    return date(candidate.year, candidate.month, 1)


def ipca_12m_pct(as_of: date) -> tuple[float, date]:
    through = _last_published_ipca_month(as_of)
    monthly = _sgs(IPCA_MONTHLY_SERIES, date(through.year - 1, through.month, 1), through)
    last_twelve = [rate for day, rate in monthly if day <= through][-12:]
    return _compound_pct(last_twelve), through


def _close_on_or_before(timestamps: list[int], closes: list[float | None], day: date) -> float:
    limit = datetime.combine(day, time(23, 59), tzinfo=timezone.utc).timestamp()
    eligible = [close for ts, close in zip(timestamps, closes) if ts <= limit and close is not None]
    return eligible[-1]


def ibovespa_period_pct(start: date, end: date) -> float:
    first = datetime.combine(start - timedelta(days=7), time(0), tzinfo=timezone.utc)
    last = datetime.combine(end + timedelta(days=1), time(0), tzinfo=timezone.utc)
    params = {"period1": int(first.timestamp()), "period2": int(last.timestamp()), "interval": "1d"}
    response = requests.get(YAHOO_URL, params=params, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    response.raise_for_status()
    result = response.json()["chart"]["result"][0]
    timestamps, closes = result["timestamp"], result["indicators"]["quote"][0]["close"]
    return (_close_on_or_before(timestamps, closes, end) / _close_on_or_before(timestamps, closes, start) - 1) * 100


def fetch_benchmarks(start: date, end: date) -> Benchmarks:
    ipca, through = ipca_12m_pct(end)
    return Benchmarks(
        period_start=start.isoformat(),
        period_end=end.isoformat(),
        cdi_pct=cdi_period_pct(start, end),
        ibovespa_pct=ibovespa_period_pct(start, end),
        ipca_12m_pct=ipca,
        ipca_12m_through=through.isoformat(),
        source="BCB SGS (CDI série 12, IPCA série 433) e Yahoo Finance (^BVSP)",
    )


def benchmarks(start: date, end: date, cache: Path, refresh: bool) -> Benchmarks | None:
    if cache.exists() and not refresh:
        return Benchmarks(**json.loads(cache.read_text(encoding="utf-8")))
    try:
        result = fetch_benchmarks(start, end)
    except (requests.RequestException, KeyError, IndexError):
        return Benchmarks(**json.loads(cache.read_text(encoding="utf-8"))) if cache.exists() else None
    cache.write_text(json.dumps(asdict(result), ensure_ascii=False, indent=2), encoding="utf-8")
    return result
