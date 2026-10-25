import math
from bisect import bisect_right
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from .elexon import parse_time, to_iso

LEAD_BUCKET_HOURS = 6
MAX_LEAD_HOURS = 48

Pair = Tuple[float, float]


class WindHistory:
    def __init__(self, data: dict, timezone_name: str) -> None:
        self.london = ZoneInfo(timezone_name)
        self.first_delivery = date.fromisoformat(data["meta"]["deliveryFrom"])
        self.last_delivery = date.fromisoformat(data["meta"]["deliveryTo"])
        self.downloaded_at = data["meta"].get("downloadedAt")

        self.actuals = {parse_time(row["startTime"]): row["generation"] for row in data["actuals"]}
        self.forecasts: Dict[datetime, Dict[datetime, float]] = defaultdict(dict)
        for row in data["forecasts"]:
            self.forecasts[parse_time(row["publishTime"])][parse_time(row["startTime"])] = row["generation"]
        self.publish_times = sorted(self.forecasts)

    def delivery_days(self) -> List[date]:
        count = (self.last_delivery - self.first_delivery).days + 1
        return [self.first_delivery + timedelta(days=i) for i in range(count)]

    def latest_forecast_before(self, moment: datetime) -> Optional[datetime]:
        index = bisect_right(self.publish_times, moment)
        return self.publish_times[index - 1] if index else None

    def day_ahead(self, delivery_day: date, decision_time: time) -> dict:
        decided_at = datetime.combine(delivery_day - timedelta(days=1), decision_time, tzinfo=self.london)
        published_at = self.latest_forecast_before(decided_at)
        forecast = self.forecasts[published_at] if published_at else {}

        hours, pairs = [], []
        for start in self.hours_of(delivery_day):
            forecast_mw = forecast.get(start)
            actual_mw = self.actuals.get(start)
            error_mw = None
            if forecast_mw is not None and actual_mw is not None:
                error_mw = forecast_mw - actual_mw
                pairs.append((forecast_mw, actual_mw))
            hours.append({
                "time": to_iso(start),
                "hour": start.astimezone(self.london).strftime("%H:%M"),
                "forecastMw": forecast_mw,
                "actualMw": actual_mw,
                "errorMw": error_mw,
            })

        return {
            "deliveryDay": delivery_day.isoformat(),
            "decidedAt": decided_at.isoformat(),
            "publishedAt": to_iso(published_at) if published_at else None,
            "minutesBeforeDecision": int((decided_at - published_at).total_seconds() // 60) if published_at else None,
            "hours": hours,
            "summary": summarise(pairs),
        }

    def accuracy(self, decision_time: time) -> dict:
        everything: List[Pair] = []
        by_hour: Dict[str, List[Pair]] = defaultdict(list)
        days = []

        for delivery_day in self.delivery_days():
            result = self.day_ahead(delivery_day, decision_time)
            pairs = [(h["forecastMw"], h["actualMw"]) for h in result["hours"] if h["errorMw"] is not None]
            for hour in result["hours"]:
                if hour["errorMw"] is not None:
                    by_hour[hour["hour"]].append((hour["forecastMw"], hour["actualMw"]))
            everything += pairs
            days.append({"deliveryDay": result["deliveryDay"], "publishedAt": result["publishedAt"], **summarise(pairs)})

        return {
            "decisionTime": decision_time.strftime("%H:%M"),
            "summary": summarise(everything),
            "byHour": [{"hour": hour, **summarise(by_hour[hour])} for hour in sorted(by_hour)],
            "byDay": days,
            "byLeadTime": self.by_lead_time(),
        }

    def by_lead_time(self) -> List[dict]:
        buckets: Dict[int, List[Pair]] = defaultdict(list)
        for published_at, forecast in self.forecasts.items():
            for start, forecast_mw in forecast.items():
                actual_mw = self.actuals.get(start)
                lead_hours = (start - published_at).total_seconds() / 3600
                if actual_mw is not None and 0 <= lead_hours < MAX_LEAD_HOURS:
                    buckets[int(lead_hours // LEAD_BUCKET_HOURS)].append((forecast_mw, actual_mw))

        return [
            {"fromHours": i * LEAD_BUCKET_HOURS, "toHours": (i + 1) * LEAD_BUCKET_HOURS, **summarise(buckets[i])}
            for i in range(MAX_LEAD_HOURS // LEAD_BUCKET_HOURS)
        ]

    def hours_of(self, day: date) -> List[datetime]:
        start = datetime.combine(day, time(0), tzinfo=self.london).astimezone(timezone.utc)
        end = datetime.combine(day + timedelta(days=1), time(0), tzinfo=self.london).astimezone(timezone.utc)
        return [start + timedelta(hours=i) for i in range(int((end - start).total_seconds() // 3600))]


def summarise(pairs: List[Pair]) -> dict:
    if not pairs:
        return {key: None for key in ("maeMw", "rmseMw", "biasMw", "p90Mw", "errorPct", "forecastGwh", "actualGwh")} | {"hours": 0}

    errors = [forecast - actual for forecast, actual in pairs]
    absolute = sorted(abs(e) for e in errors)
    mae = sum(absolute) / len(errors)
    forecast_total = sum(f for f, _ in pairs)
    actual_total = sum(a for _, a in pairs)
    return {
        "hours": len(errors),
        "maeMw": round(mae),
        "rmseMw": round(math.sqrt(sum(e * e for e in errors) / len(errors))),
        "biasMw": round(sum(errors) / len(errors)),
        "p90Mw": round(absolute[min(len(absolute) - 1, int(0.9 * len(absolute)))]),
        "errorPct": round(100 * mae * len(errors) / actual_total, 1) if actual_total else None,
        "forecastGwh": round(forecast_total / 1000, 1),
        "actualGwh": round(actual_total / 1000, 1),
    }
