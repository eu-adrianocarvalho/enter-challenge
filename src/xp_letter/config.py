"""Carrega a configuração (arquivos YAML em config/) e resolve caminhos a partir da raiz do repositório.
Settings expõe o período de referência, as pastas de dados e de saída, os limites das checagens
e o caminho de cada arquivo de entrada definido em config/settings.yaml."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = REPO_ROOT / "config"


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def repo_path(relative: str) -> Path:
    return REPO_ROOT / relative


@dataclass(frozen=True)
class Settings:
    raw: dict[str, Any]

    @property
    def period_start(self) -> date:
        return date.fromisoformat(self.raw["period"]["start"])

    @property
    def period_end(self) -> date:
        return date.fromisoformat(self.raw["period"]["end"])

    @property
    def data_dir(self) -> Path:
        return repo_path(self.raw["paths"]["data_dir"])

    @property
    def output_dir(self) -> Path:
        return repo_path(self.raw["paths"]["output_dir"])

    @property
    def thresholds(self) -> dict[str, float]:
        return self.raw["thresholds"]

    def input_path(self, section: str, key: str) -> Path:
        return repo_path(self.raw[section][key])


def load_settings() -> Settings:
    return Settings(load_yaml(CONFIG_DIR / "settings.yaml"))


def load_config(name: str) -> dict[str, Any]:
    return load_yaml(CONFIG_DIR / f"{name}.yaml")
