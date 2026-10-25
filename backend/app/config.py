from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "elexon_cache.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    timezone: str = "Europe/London"
    decision_from: date = date(2026, 1, 1)
    decision_to: date = date(2026, 1, 31)
    default_decision_time: str = "09:00"
    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
