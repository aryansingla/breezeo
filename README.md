# Wind Forecast Check

A web app for a UK utility's day-ahead buying team. Before buying power for tomorrow, they need to know how much wind to expect and how far to trust that number.

For purchase decisions made in January 2026 it shows:

1. **The latest forecast at decision time.** Pick a delivery day and the time you buy the day before. The app finds the most recent Elexon wind forecast published before then and compares it with what actually happened, hour by hour.
2. **How accurate those forecasts are.** Average error, bias, RMSE, the worst 10% of hours, and forecast against actual energy, broken down by day, by hour of day and by how far ahead the forecast was made.

Live app: _add URL after deploying_

## Data

National wind from Elexon BMRS:

- Actuals: [`FUELHH`](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) with `fuelType = WIND`
- Forecasts: [`WINDFOR`](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream), republished several times a day

Decisions on 1–31 January cover delivery from 2 January to 1 February. The data is downloaded once into `backend/data/elexon_cache.json`, so every run gives the same numbers and the app doesn't depend on Elexon being up.

## Decisions

- **The user picks the decision time.** It defaults to 09:00 UK time the day before delivery.
- **Hourly comparison.** WINDFOR is hourly, so each forecast hour is compared with the actual for the same hour. Nothing is interpolated.
- **Error = forecast − actual.** Positive means the forecast promised more wind than arrived, so a desk relying on it bought too little.
- **No login and no database.** The data is public and covers a fixed month, so a JSON file is enough.
- **Every view has a link.** Page, day, decision time and table sort live in the URL, for example `/accuracy?time=17:00&sort=average-error&order=desc`. Sorting happens in the browser because the tables are small and already loaded.

## What January shows

- At 09:00 the day before, the forecast was off by about 2.0 GW in a typical hour, 18% of actual wind.
- It was too high on 27 of 31 days, by about 1.7 GW on average, and still too high just hours before delivery.
- Error grows with lead time: 1.65 GW within 6 hours, 2.3 GW at 42–48 hours. Deciding at 17:00 instead of 09:00 cuts the average error to about 1.86 GW.

## Files

```
backend/
  app/config.py      settings, read from .env
  app/elexon.py      Elexon client and data download
  app/engine.py      picks the forecast available at decision time and scores it
  app/main.py        API endpoints, also serves the built frontend
  data/              downloaded Elexon data
  tests/             engine tests
frontend/
  src/App.tsx        layout, URL routing
  src/ForecastPage.tsx
  src/AccuracyPage.tsx
  src/api.ts         API types and requests
  src/ui.tsx         formatting, sortable tables, summary cards, charts
  src/styles.css
Dockerfile           builds the frontend and serves it from FastAPI
docker-compose.yml
.env.example
```

## Running

```bash
cp .env.example .env
```

**With Docker:**

```bash
docker compose up --build
```

Open http://localhost:8000

**Without Docker** (Python 3.9+, Node 20+), in two terminals:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

**Tests and fresh data:**

```bash
cd backend
pytest
python -m app.elexon
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `TIMEZONE` | `Europe/London` | Local time for decisions |
| `DECISION_FROM`, `DECISION_TO` | `2026-01-01`, `2026-01-31` | Decision days to download |
| `DEFAULT_DECISION_TIME` | `09:00` | Starting decision time |
| `ELEXON_BASE_URL` | `https://data.elexon.co.uk/bmrs/api/v1` | Elexon API |
| `CORS_ORIGINS`, `VITE_API_URL` | local defaults | Only needed if frontend and API are hosted separately |

## AI tools

I used Cursor, an AI coding assistant, for scaffolding, exploring the Elexon API and reviewing code. I made the design decisions and checked the numbers against the raw Elexon data.

## Credits

Logo: `cloud-search` icon from [Material Design Icons](https://pictogrammers.com/library/mdi/), Apache License 2.0.
