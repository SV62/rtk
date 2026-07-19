// Cloudflare Worker: fetches a Kerala rubber price bulletin page server-side
// (bypassing the browser's CORS restriction, which is why the frontend
// can't just `fetch()` the bulletin page directly) and returns a small
// JSON price object.
//
// STATUS: scaffold only, not deployed, not wired into index.html yet.
// SOURCE_URL below is a placeholder. It could not be filled in with a
// verified value because the environment this was written in has no
// network access to any candidate source (Rubber Board, market bulletins,
// etc.) to inspect their real markup. Shipping a guessed URL/regex would
// most likely just silently fail forever, so this needs a human step
// first — see worker/README.md for exactly what's needed and how to wire
// it up once you have it.

const SOURCE_URL = "REPLACE_ME_WITH_REAL_BULLETIN_URL";
const SANITY_MIN = 100; // ₹/kg — reject extracted numbers outside this band
const SANITY_MAX = 300;

// Looks for a grade label (RSS4 / RSS 4 / RSS-4) followed within ~40 chars
// by a plausible ₹/kg number. Regex-based rather than CSS-selector-based
// so it's more resilient to markup/layout changes on a page nobody has
// actually inspected while writing this — but it still needs to be
// checked against the real page text before it can be trusted.
const PRICE_PATTERN = /RSS[\s-]?4[^0-9]{0,40}?(\d{2,3}(?:\.\d{1,2})?)/i;

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (SOURCE_URL.startsWith("REPLACE_ME")) {
      return json({ error: "SOURCE_URL not configured yet — see worker/README.md" }, 501, cors);
    }

    try {
      const res = await fetch(SOURCE_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RubberTapKerala/1.0)" },
      });
      if (!res.ok) {
        return json({ error: "source fetch failed", status: res.status }, 502, cors);
      }
      const html = await res.text();
      const match = html.match(PRICE_PATTERN);
      if (!match) {
        return json({ error: "price pattern not found on page — regex needs adjusting" }, 502, cors);
      }
      const price = parseFloat(match[1]);
      if (isNaN(price) || price < SANITY_MIN || price > SANITY_MAX) {
        return json({ error: "extracted value failed sanity check", raw: match[1] }, 502, cors);
      }
      return json(
        { price, grade: "RSS4", unit: "INR/kg", source: SOURCE_URL, fetchedAt: new Date().toISOString() },
        200,
        cors
      );
    } catch (e) {
      return json({ error: String(e) }, 500, cors);
    }
  },
};

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}),
  });
}
