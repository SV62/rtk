// Cloudflare Worker: gets today's Kottayam RSS4 rubber price.
//
// PRIMARY (verified working): commoditymarketlive.com's FAQ section
// states domestic and international prices in a precise, distinguishable
// format:
//   domestic:      "...RSS4 rubber is Rs 282 recorded AT THE Kottayam market."
//   international: "...RSS4 rubber is Rs 287.51 recorded IN THE Bangkok market."
// "recorded at the Kottayam market" vs "recorded in the Bangkok market"
// is the precise phrase this keys off, confirmed against real page output
// (a debug dump of every "Kottayam" occurrence on the live page) - this
// is not a guess, the exact wording above is what the page actually
// returned.
//
// Earlier attempts (kept as documented history, not used):
// - kisandeals.com returns HTTP 403 to server-side requests (bot
//   protection).
// - thecanarapost.com's domestic Kottayam price isn't present as text at
//   all (likely an image); only the Bangkok price is scrapable there.
// - A loose "RSS4 near the word Kottayam" proximity check on
//   commoditymarketlive.com wasn't precise enough - it grabbed the
//   Bangkok price too, since "Kottayam" appears close to it in an
//   unrelated table row on the same page. The exact-phrase pattern above
//   fixes that.
// - Gemini AI web search was tried as an alternative, but its free tier
//   doesn't include search grounding (confirmed via HTTP 429 quota
//   errors on two separate Google accounts) - would need billing enabled
//   to use. Not needed now that the regex above is verified working.

const SANITY_MIN = 100; // ₹/kg — reject numbers outside this band
const SANITY_MAX = 300;

const CACHE_SECONDS = 6 * 60 * 60; // 6 hours - a daily price doesn't need re-fetching every request

const KOTTAYAM_PATTERN =
  /RSS[\s-]?4\s+rubber\s+is\s+Rs\.?\s*(\d+(?:\.\d+)?)\s+recorded\s+at\s+the\s+Kottayam\s+market/i;

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await tryCommodityMarketLive();

    if (!result.ok) {
      const response = json(result.data, 502, cors);
      return response;
    }

    const response = json(result.data, 200, cors);
    ctx.waitUntil(cache.put(cacheKey, response.clone(), { expirationTtl: CACHE_SECONDS }));
    return response;
  },
};

async function tryCommodityMarketLive() {
  const sourceUrl = "https://www.commoditymarketlive.com/rubber-price";
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RubberTapKerala/1.0)" },
    });
    if (!res.ok) {
      return { ok: false, data: { source: sourceUrl, error: "source fetch failed", status: res.status } };
    }
    const html = await res.text();
    const text = stripHtml(html);

    const match = text.match(KOTTAYAM_PATTERN);
    if (!match) {
      return {
        ok: false,
        data: { source: sourceUrl, error: "Kottayam-specific pattern not found", excerpt: text.slice(0, 1500) },
      };
    }

    const price = parseFloat(match[1]);
    if (isNaN(price) || price < SANITY_MIN || price > SANITY_MAX) {
      return {
        ok: false,
        data: {
          source: sourceUrl,
          error: "extracted value failed sanity check (expected " + SANITY_MIN + "-" + SANITY_MAX + " ₹/kg)",
          raw: match[1],
        },
      };
    }

    return {
      ok: true,
      data: {
        price,
        grade: "RSS4",
        unit: "INR/kg",
        method: "commoditymarketlive-verified",
        source: sourceUrl,
        fetchedAt: new Date().toISOString(),
      },
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
