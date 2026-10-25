from datetime import date, time

from app.engine import WindHistory, summarise


def sample_history():
    return WindHistory(
        {
            "meta": {"deliveryFrom": "2026-01-02", "deliveryTo": "2026-01-02"},
            "actuals": [
                {"startTime": "2026-01-02T00:00:00Z", "generation": 1000},
                {"startTime": "2026-01-02T00:30:00Z", "generation": 1100},
                {"startTime": "2026-01-02T01:00:00Z", "generation": 1200},
            ],
            "forecasts": [
                {"publishTime": "2026-01-01T07:30:00Z", "startTime": "2026-01-02T00:00:00Z", "generation": 1500},
                {"publishTime": "2026-01-01T07:30:00Z", "startTime": "2026-01-02T01:00:00Z", "generation": 1000},
                {"publishTime": "2026-01-01T11:30:00Z", "startTime": "2026-01-02T00:00:00Z", "generation": 1100},
            ],
        },
        "Europe/London",
    )


def test_uses_latest_forecast_published_before_decision():
    result = sample_history().day_ahead(date(2026, 1, 2), time(9, 0))
    assert result["publishedAt"] == "2026-01-01T07:30:00Z"
    assert result["minutesBeforeDecision"] == 90


def test_later_decision_uses_newer_forecast():
    result = sample_history().day_ahead(date(2026, 1, 2), time(12, 0))
    assert result["publishedAt"] == "2026-01-01T11:30:00Z"


def test_no_forecast_published_yet():
    result = sample_history().day_ahead(date(2026, 1, 2), time(6, 0))
    assert result["publishedAt"] is None
    assert result["summary"]["hours"] == 0


def test_half_hour_actuals_are_not_compared():
    result = sample_history().day_ahead(date(2026, 1, 2), time(9, 0))
    assert [h["errorMw"] for h in result["hours"] if h["errorMw"] is not None] == [500, -200]


def test_positive_bias_means_forecast_too_high():
    summary = summarise([(1500, 1000), (1000, 1200)])
    assert summary["maeMw"] == 350
    assert summary["biasMw"] == 150
    assert summary["forecastGwh"] == 2.5
    assert summary["actualGwh"] == 2.2


def test_lead_time_buckets():
    twelve_to_eighteen = next(b for b in sample_history().by_lead_time() if b["fromHours"] == 12)
    assert twelve_to_eighteen["hours"] == 3
