# Live price worker (scaffold, not deployed yet)

`price-worker.js` is a [Cloudflare Worker](https://workers.cloudflare.com/) (free tier, no credit card) meant to fetch an official Kerala rubber price bulletin page server-side and return today's RSS4 price as JSON. It exists because:

- The browser can't fetch most bulletin pages directly — they don't send the `Access-Control-Allow-Origin` header a static site needs, so the request gets blocked by CORS before it even reaches the page.
- A Worker runs server-side, so it isn't subject to that browser restriction — it fetches the HTML, extracts a price, and returns clean JSON with CORS headers of its own.

## Why this isn't finished

This scaffold was written in an environment with no network access to any candidate source (Rubber Board site, market bulletins, etc.) — every outbound request there returned a blocked-by-policy error, including to `rubberboard.gov.in`, `rubberboard.org.in`, and `data.gov.in`. That means:

- `SOURCE_URL` in `price-worker.js` is a placeholder, not a verified page.
- `PRICE_PATTERN` (a regex looking for `RSS4` near a plausible ₹/kg number) has never been checked against real page text.

Shipping a guessed URL and regex would most likely just fail silently forever, so the site does **not** call this Worker yet — "Today's price" on the live site is your own logged price instead, which is reliable by construction.

## What's needed to finish this

1. **The exact URL** of the page you currently check for the daily RSS4/sheet rate (Rubber Board bulletin, a market society's page, etc.).
2. **A copy-paste of the relevant text**, or a screenshot, of that page's price table/section — so the regex can be written against real content instead of a guess.

With those two things, `SOURCE_URL` and `PRICE_PATTERN` can be filled in for real, and `index.html`'s "Today's price" card can be wired to call the deployed Worker first, falling back to your logged price if the fetch or the pattern match ever fails.

## Deploying it (once configured)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → sign up free (no card needed) → **Workers & Pages** → **Create** → **Create Worker**.
2. Replace the default script with the contents of `price-worker.js` (with `SOURCE_URL` filled in).
3. **Deploy**. Cloudflare gives you a URL like `https://<name>.<account>.workers.dev`.
4. Send that URL back so `index.html` can be updated to call it.

## A caveat worth knowing

Scraping a page is inherently fragile — any redesign of the source site can silently break `PRICE_PATTERN` again, and scraping may be against the source site's terms of use even when technically possible. If Rubber Board or another body ever publishes an official public API or data feed, switching to that would be more robust than this approach.
