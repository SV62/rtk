// Cloudflare Worker: fetches Kerala rubber price pages server-side
// (bypassing the browser's CORS restriction, which is why the frontend
// can't just `fetch()` these source pages directly) and word-searches the
// fetched text for an RSS4 price, returning a small JSON object.
//
// STATUS: best-effort, NOT YET VERIFIED against either live page. The
// environment this was written in has no network access to any external
// site (confirmed via repeated blocked requests to both URLs below), so
// PRICE_PATTERN has never actually been run against real page text from
// either source.
//
// Tries SOURCES in order and returns the first one that yields a
// sane-looking price. If a source fails, its JSON response includes
// debugging context (the text around a near-miss, or a stripped excerpt
// of the page) so the failure can be diagnosed and the pattern fixed from
// that response alone — no screenshot needed.
const SOURCES = [
  // Structured mandi-price listing — likely a table of market/grade/price
  // rows, which tends to be more consistent to parse than prose.
  "https://kisandeals.com/mandiprices/RUBBER/KERALA/ALL",
  // Prose/news-style daily price post, as a fallback.
  "https://thecanarapost.com/todays-rubber-prices-kottayam-and-international-market/",
];

const SANITY_MIN = 100; // ₹/kg — reject extracted numbers outside this band
const SANITY_MAX = 300;

// Matches RSS4 / RSS-4 / RSS 4 / RSS IV (case-insensitive), then within up
// to 80 characters, an optional currency marker and a number. Kept broad
// on purpose since the exact wording on either page is unknown.
const PRICE_PATTERN = /RSS[\s-]?(?:4|IV)\b[^0-9₹]{0,80}?(?:₹|Rs\.?|INR)?\s*(\d{2,6}(?:[.,]\d{1,2})?)/i;

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const attempts = [];
    for (const sourceUrl of SOURCES) {
      const result = await tryExtract(sourceUrl);
      if (result.ok) {
        return json(result.data, 200, cors);
      }
      attempts.push(result.data);
    }
    // Every source failed — return all diagnostics together.
    return json({ error: "no source yielded a price", attempts }, 502, cors);
  },
};

async function tryExtract(sourceUrl) {
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RubberTapKerala/1.0)" },
    });
    if (!res.ok) {
      return { ok: false, data: { source: sourceUrl, error: "source fetch failed", status: res.status } };
    }
    const html = await res.text();
    const text = stripHtml(html);

    const match = text.match(PRICE_PATTERN);
    if (!match) {
      return {
        ok: false,
        data: { source: sourceUrl, error: "price pattern not found on page", excerpt: text.slice(0, 800) },
      };
    }

    const rawNumber = match[1].replace(",", ".");
    const price = parseFloat(rawNumber);
    const matchIndex = match.index || 0;
    const context = text.slice(Math.max(0, matchIndex - 40), matchIndex + 120);

    if (isNaN(price) || price < SANITY_MIN || price > SANITY_MAX) {
      return {
        ok: false,
        data: {
          source: sourceUrl,
          error: "extracted value failed sanity check (expected " + SANITY_MIN + "-" + SANITY_MAX + " ₹/kg)",
          raw: match[1],
          context,
        },
      };
    }

    return {
      ok: true,
      data: { price, grade: "RSS4", unit: "INR/kg", source: sourceUrl, fetchedAt: new Date().toISOString(), context },
    };
  } catch (e) {
    return { ok: false, data: { source: sourceUrl, error: String(e) } };
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {}),
  });
}
