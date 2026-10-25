import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List
from zoneinfo import ZoneInfo

import httpx

from .config import DATA_FILE, Settings, get_settings

MAX_LEAD = timedelta(hours=48)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def to_iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ElexonClient:
    def __init__(self, base_url: str) -> None:
        self.http = httpx.Client(base_url=base_url, timeout=120)

    def wind_actuals(self, first_day: date, last_day: date) -> List[dict]:
        rows = []
        day = first_day
        while day <= last_day:
            end = min(day + timedelta(days=9), last_day)
            rows += self.get("/datasets/FUELHH/stream", {
                "settlementDateFrom": day.isoformat(),
                "settlementDateTo": end.isoformat(),
                "fuelType": "WIND",
            })
            day = end + timedelta(days=1)
        return rows

    def wind_forecasts(self, published_from: datetime, published_to: datetime) -> List[dict]:
        rows = []
        start = published_from
        while start < published_to:
            end = min(start + timedelta(days=3), published_to)
            rows += self.get("/datasets/WINDFOR/stream", {
                "publishDateTimeFrom": to_iso(start),
                "publishDateTimeTo": to_iso(end),
            })
            start = end
        return rows

    def get(self, path: str, params: Dict[str, str]) -> List[dict]:
        response = self.http.get(path, params=params)
        response.raise_for_status()
        return response.json()


def download(settings: Settings) -> dict:
    london = ZoneInfo(settings.timezone)
    first_delivery = settings.decision_from + timedelta(days=1)
    last_delivery = settings.decision_to + timedelta(days=1)
    published_from = datetime.combine(first_delivery, time(0), tzinfo=london) - MAX_LEAD
    published_to = datetime.combine(last_delivery + timedelta(days=1), time(0), tzinfo=london)

    client = ElexonClient(settings.elexon_base_url)
    actuals = {
        row["startTime"]: {"startTime": to_iso(parse_time(row["startTime"])), "generation": row["generation"]}
        for row in client.wind_actuals(first_delivery, last_delivery)
        if row.get("fuelType") == "WIND" and row.get("generation") is not None
    }
    forecasts = {
        (row["publishTime"], row["startTime"]): {
            "publishTime": to_iso(parse_time(row["publishTime"])),
            "startTime": to_iso(parse_time(row["startTime"])),
            "generation": row["generation"],
        }
        for row in client.wind_forecasts(published_from, published_to)
        if row.get("generation") is not None
    }

    data = {
        "meta": {
            "deliveryFrom": first_delivery.isoformat(),
            "deliveryTo": last_delivery.isoformat(),
            "downloadedAt": to_iso(datetime.now(timezone.utc)),
        },
        "actuals": sorted(actuals.values(), key=lambda r: r["startTime"]),
        "forecasts": sorted(forecasts.values(), key=lambda r: (r["publishTime"], r["startTime"])),
    }
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data))
    return data


def load(settings: Settings) -> dict:
    if not DATA_FILE.exists():
        return download(settings)
    return json.loads(DATA_FILE.read_text())


if __name__ == "__main__":
    result = download(get_settings())
    print(f"Saved {len(result['actuals'])} actuals and {len(result['forecasts'])} forecasts to {DATA_FILE}")
