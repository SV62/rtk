# Live price worker (built, not deployed yet)

`price-worker.js` is a [Cloudflare Worker](https://workers.cloudflare.com/) (free tier, no credit card) that fetches Kerala rubber price pages server-side and word-searches the text for an RSS4 price, returning JSON. It exists because:

- The browser can't fetch these pages directly — they don't send the `Access-Control-Allow-Origin` header a static site needs, so the request gets blocked by CORS before it even reaches the page.
- A Worker runs server-side, so it isn't subject to that browser restriction.

It currently tries two sources in order, using the first one that yields a plausible price:

1. `https://kisandeals.com/mandiprices/RUBBER/KERALA/ALL` — a structured mandi-price listing.
2. `https://thecanarapost.com/todays-rubber-prices-kottayam-and-international-market/` — a daily price post, as fallback.

## Why this isn't verified yet

The environment this was written in has no network access to *any* external site — every outbound request there was blocked at the network-policy level, including to both URLs above, `rubberboard.gov.in`, `rubberboard.org.in`, and `data.gov.in`. So `PRICE_PATTERN` (which looks for `RSS4`/`RSS-4`/`RSS 4`/`RSS IV` near a plausible ₹/kg number) has been checked against several hand-written synthetic examples of how such text might look, but never against either page's actual content. It's written to be tolerant of common label/formatting variants precisely because of that uncertainty — but "tolerant of variants I imagined" isn't the same as "confirmed correct."

Because of that, the site does **not** call this Worker yet — "Today's price" on the live site is your own logged price instead, which is correct by construction regardless of any of this.

## What's needed to finish this

Deploy it (steps below) and send me whatever JSON it returns — success or error, either is useful:

- **If it returns a price**: sanity-check that number against what you know the real rate to be today. If it's right, I'll wire `index.html`'s "Today's price" card to call this Worker first and fall back to your logged price only if the call fails.
- **If it returns an error**: the response includes an `excerpt` or `context` field showing the actual text the Worker saw on the page — paste that back and I can fix `PRICE_PATTERN` precisely from it, no screenshot needed.

## Deploying it

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → sign up free (no card needed) → **Workers & Pages** → **Create** → **Create Worker**.
2. Replace the default script with the full contents of `price-worker.js`.
3. **Deploy**. Cloudflare gives you a URL like `https://<name>.<account>.workers.dev`.
4. Open that URL in a browser (or `curl` it) and send me what it returns.

## A caveat worth knowing

Scraping a page is inherently fragile — any redesign of either source site can silently break `PRICE_PATTERN` again, and scraping may be against a source site's terms of use even when technically possible. If Rubber Board or another body ever publishes an official public API or data feed, switching to that would be more robust than this approach.
