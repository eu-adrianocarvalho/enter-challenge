"""Calcula o retorno dos fundos no período com dados oficiais da CVM (informe diário, inf_diario_fi).
Baixa o arquivo de cada mês do período, filtra os CNPJs de config/fund_registry.yaml e compara a cota
do início com a do fim. Fundo sem cota diária (o Brave virou FIDC) usa a estimativa do registro.
O resultado fica em data/market/ para não baixar tudo de novo."""
from __future__ import annotations

import csv
import io
import json
import tempfile
import zipfile
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

import requests

INF_DIARIO_URL = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_{yyyymm}.zip"


@dataclass(frozen=True)
class FundReturn:
    statement_name: str
    cnpj: str | None
    return_pct: float
    method: str
    start_date: str | None = None
    start_quota: float | None = None
    end_date: str | None = None
    end_quota: float | None = None


def _months_between(start: date, end: date) -> list[str]:
    months, cursor = [], date(start.year, start.month, 1)
    while cursor <= end:
        months.append(cursor.strftime("%Y%m"))
        cursor = date(cursor.year + cursor.month // 12, cursor.month % 12 + 1, 1)
    return months


def _download(url: str, target: Path) -> None:
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 20):
                handle.write(chunk)


def _quote_rows(zip_path: Path, cnpjs: set[str]) -> list[dict[str, str]]:
    with zipfile.ZipFile(zip_path) as archive:
        member = archive.namelist()[0]
        with archive.open(member) as raw:
            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="latin-1"), delimiter=";")
            return [row for row in reader if row.get("CNPJ_FUNDO_CLASSE") in cnpjs]


def _last_quote_on_or_before(rows: list[dict[str, str]], cnpj: str, day: date) -> tuple[str, float] | None:
    eligible = [r for r in rows if r["CNPJ_FUNDO_CLASSE"] == cnpj and r["DT_COMPTC"] <= day.isoformat()]
    if not eligible:
        return None
    latest = max(eligible, key=lambda r: r["DT_COMPTC"])
    return latest["DT_COMPTC"], float(latest["VL_QUOTA"])


def _quota_return(fund: dict[str, Any], rows: list[dict[str, str]], start: date, end: date) -> FundReturn | None:
    first = _last_quote_on_or_before(rows, fund["cnpj"], start)
    last = _last_quote_on_or_before(rows, fund["cnpj"], end)
    if first is None or last is None:
        return None
    return FundReturn(
        statement_name=fund["statement_name"],
        cnpj=fund["cnpj"],
        return_pct=(last[1] / first[1] - 1) * 100,
        method="Cota diária CVM (inf_diario_fi)",
        start_date=first[0], start_quota=first[1], end_date=last[0], end_quota=last[1],
    )


def _estimate(fund: dict[str, Any]) -> FundReturn | None:
    estimate = fund.get("monthly_estimate")
    if not estimate:
        return None
    return FundReturn(fund["statement_name"], fund.get("cnpj"), estimate["return_pct"], estimate["method"])


def fetch_fund_returns(registry: list[dict[str, Any]], start: date, end: date) -> list[FundReturn]:
    cnpjs = {fund["cnpj"] for fund in registry if fund.get("cnpj")}
    rows: list[dict[str, str]] = []
    with tempfile.TemporaryDirectory() as tmp:
        for yyyymm in _months_between(start, end):
            zip_path = Path(tmp) / f"{yyyymm}.zip"
            _download(INF_DIARIO_URL.format(yyyymm=yyyymm), zip_path)
            rows.extend(_quote_rows(zip_path, cnpjs))
    results = []
    for fund in registry:
        result = (_quota_return(fund, rows, start, end) if fund.get("cnpj") else None) or _estimate(fund)
        if result is not None:
            results.append(result)
    return results


def save_fund_returns(returns: list[FundReturn], path: Path) -> None:
    path.write_text(json.dumps([asdict(r) for r in returns], ensure_ascii=False, indent=2), encoding="utf-8")


def load_fund_returns(path: Path) -> list[FundReturn]:
    if not path.exists():
        return []
    return [FundReturn(**row) for row in json.loads(path.read_text(encoding="utf-8"))]


def fund_returns(registry: list[dict[str, Any]], start: date, end: date, cache: Path, refresh: bool) -> list[FundReturn]:
    if cache.exists() and not refresh:
        return load_fund_returns(cache)
    try:
        returns = fetch_fund_returns(registry, start, end)
    except requests.RequestException:
        return load_fund_returns(cache)
    save_fund_returns(returns, cache)
    return returns
