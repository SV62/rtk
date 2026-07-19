# RubberTap Kerala

A free, no-login tool for Kerala's rubber tappers and estate owners.

**Live site:** [vettunundo.com](https://vettunundo.com/) &nbsp;·&nbsp; [sv62.github.io/rtk](https://sv62.github.io/rtk/)

## What's here

A single self-contained `index.html` — no build step, no dependencies, no server. Main things:

- **Tapping advisory** — search any town/estate in Kerala (not just a fixed district list — weather at Kanjirappally and Mundakayam can differ a lot even though both are in Kottayam district) via [Open-Meteo's free geocoding API](https://open-meteo.com/en/docs/geocoding-api), then get a quick good/caution/don't-tap call for the early-morning tapping window, based on live rain forecast, recent rainfall, humidity, and current temperature from [Open-Meteo](https://open-meteo.com/) (both free, no API key required). A set of 10 district presets is offered as a shortcut.
- **Live rain radar** — an embedded [Windy.com](https://www.windy.com/) radar/forecast map for the selected location, using their official free embed widget (no API key, no account).
- **Price log + today's price** — log your daily RSS4/sheet rubber price (₹/kg); the most recent entry is shown prominently as "Today's price" at the top of the section. Stored only in your browser's `localStorage` — nothing is sent to a server. There's no confirmed free/CORS-enabled live API for official Kerala rubber prices, so this stays self-logged rather than faking a live feed (see `worker/` for a scaffold towards a real live feed, currently blocked on getting a verified source page — see that folder's README).
- **Price calculator** — enter a grade (RSS sheet / lump-ottupaal / field latex), quantity, and price to get the sale value, plus a simple hold/sell signal derived from your own logged price trend (not financial advice — just a reflection of your own data).
- **Local info** — one-click, location-aware search links (opens in a new tab) for the nearest Rubber Producer Society / Rubber Board office, and Kerala rubber market news — things with no embeddable data source.

Also includes a set of general good-practice tapping tips, and a full English/Malayalam language toggle.

## Running locally

```bash
open index.html
```

or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/index.html
```

## Deployment

Intended to be hosted for free on **GitHub Pages**:

1. Repo Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**
4. Save — the site publishes at `https://sv62.github.io/rtk/` within a minute or two.

## Disclaimer

The tapping advisory is a rule-of-thumb estimate from public weather forecasts — not a substitute for on-the-ground judgement or official Rubber Board guidance.
