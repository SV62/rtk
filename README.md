# RubberTap Kerala

A free, no-login tool for Kerala's rubber tappers and estate owners.

**Live site:** [sv62.github.io/rtk](https://sv62.github.io/rtk/) (once GitHub Pages is enabled — see below)

## What's here

A single self-contained `index.html` — no build step, no dependencies, no server. Two things:

- **Tapping advisory** — pick a Kerala rubber-growing district and get a quick good/caution/don't-tap call for the early-morning tapping window, based on live rain forecast, recent rainfall, humidity, and current temperature from [Open-Meteo](https://open-meteo.com/) (free, no API key required).
- **Local info, live** — one-click, district-aware DuckDuckGo search links for today's rubber price, the nearest Rubber Producer Society / Rubber Board office, and Kerala rubber market news. There's no free structured API for any of these, and DuckDuckGo's result pages can't be fetched or embedded client-side (no CORS), so instead of faking "live" data these open a real, current DuckDuckGo search in a new tab, pre-filled for the selected district.
- **Price log** — log your daily RSS4/sheet rubber price (₹/kg) to track your own local trend. Stored only in your browser's `localStorage` — nothing is sent to a server.

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
