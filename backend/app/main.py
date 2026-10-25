from datetime import date, time
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .elexon import load
from .engine import WindHistory

settings = get_settings()
history = WindHistory(load(settings), settings.timezone)

app = FastAPI(title="GB wind forecast check")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_methods=["GET"])


def read_time(value: str) -> time:
    try:
        return time.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, "decision_time must look like HH:MM")


def read_day(value: str) -> date:
    try:
        day = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, "delivery_day must look like YYYY-MM-DD")
    if not history.first_delivery <= day <= history.last_delivery:
        raise HTTPException(404, f"Pick a day between {history.first_delivery} and {history.last_delivery}")
    return day


@lru_cache(maxsize=48)
def accuracy_at(decision_time: time) -> dict:
    return history.accuracy(decision_time)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/meta")
def meta():
    return {
        "deliveryFrom": history.first_delivery.isoformat(),
        "deliveryTo": history.last_delivery.isoformat(),
        "defaultDecisionTime": settings.default_decision_time,
        "downloadedAt": history.downloaded_at,
    }


@app.get("/api/day-ahead")
def day_ahead(delivery_day: str, decision_time: str = settings.default_decision_time):
    return history.day_ahead(read_day(delivery_day), read_time(decision_time))


@app.get("/api/accuracy")
def accuracy(decision_time: str = settings.default_decision_time):
    return accuracy_at(read_time(decision_time))


class SinglePageApp(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code != 404 or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


static = Path(__file__).resolve().parent.parent / "static"
if static.exists():
    app.mount("/", SinglePageApp(directory=static, html=True), name="static")
