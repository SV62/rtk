// Cloudflare Worker: gets today's Kottayam RSS4 rubber price two ways.
//
// PRIMARY: ask Gemini (Google's AI) to search the web and report the
// current Kottayam domestic price. An AI reading real search results can
// tell "this is the Kottayam price" from "this is the Bangkok
// international price" by understanding context — which is exactly what
// plain regex kept failing at (see FALLBACK comment below for the
// concrete failures that motivated this).
//
// Needs a GEMINI_API_KEY secret set in this Worker's Settings ->
// Variables and Secrets. Free tier, from https://aistudio.google.com.
//
// FALLBACK: if the AI call fails for any reason (missing key, quota,
// network), falls back to the earlier regex-based scraping attempts.
// Kept as a safety net, though live testing showed real problems with
// each of these sources:
// - kisandeals.com returns HTTP 403 to server-side requests (bot
//   protection).
// - thecanarapost.com's domestic Kottayam price isn't present as text at
//   all (likely shown as an image); only the Bangkok international price
//   is scrapable text there.
// - commoditymarketlive.com only had Bangkok international content in
//   the areas tested — a proximity-based "Kottayam near RSS4" check
//   still isn't reliable enough here to trust.
// - rubberboard.gov.in/public was added but never confirmed working.
//
// STATUS: not yet verified end-to-end (no network access from the
// environment this was written in to test the Gemini call itself).

const SANITY_MIN = 100; // ₹/kg — reject numbers outside this band, from either method
const SANITY_MAX = 300;

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_PROMPT =
  "Search the web for today's RSS4 grade rubber price at the Kottayam market in Kerala, India, " +
  "in Indian Rupees per kilogram (INR/kg). This is the domestic Indian market price, NOT the " +
  "Bangkok or any other international market price - those are different numbers, do not confuse them. " +
  "Respond with ONLY a single JSON object and nothing else, no other text, no markdown formatting, " +
  "in exactly this shape: {\"price\": <number>, \"date\": \"<date the price is for, as shown on the source>\", \"source\": \"<name or URL of the page you found this on>\"}. " +
  "If you cannot find a real current Kottayam RSS4 price, respond with exactly: {\"error\": \"not found\"}";

// Cache the result so we're not paying for/hitting quota on an AI web
// search on every single page load - a rubber price is a "few times a
// day at most" kind of number, not a per-request one.
const CACHE_SECONDS = 6 * 60 * 60; // 6 hours

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

    let result = null;
    let aiError = null;

    if (env.GEMINI_API_KEY) {
      try {
        result = await tryGemini(env.GEMINI_API_KEY);
      } catch (e) {
        aiError = String(e);
      }
    } else {
      aiError = "GEMINI_API_KEY secret not set";
    }

    if (!result) {
      const attempts = [];
      for (const sourceUrl of FALLBACK_SOURCES) {
        const r = await tryExtract(sourceUrl);
        if (r.ok) {
          result = { ok: true, data: r.data };
          break;
        }
        attempts.push(r.data);
      }
      if (!result) {
        const response = json(
          { error: "no price found from AI or fallback sources", aiError, fallbackAttempts: attempts },
          502,
          cors
        );
        return response;
      }
    }

    const response = json(result.data, 200, cors);
    ctx.waitUntil(cache.put(cacheKey, response.clone(), { expirationTtl: CACHE_SECONDS }));
    return response;
  },
};

async function tryGemini(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: GEMINI_PROMPT }] }],
        tools: [{ google_search: {} }],
      }),
    }
  );

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error("Gemini API request failed: " + res.status + " " + bodyText.slice(0, 300));
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini response had no JSON: " + text.slice(0, 300));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error("Gemini response JSON did not parse: " + jsonMatch[0].slice(0, 300));
  }

  if (parsed.error) {
    throw new Error("Gemini reported: " + parsed.error);
  }

  const price = parseFloat(parsed.price);
  if (isNaN(price) || price < SANITY_MIN || price > SANITY_MAX) {
    throw new Error(
      "Gemini's price failed sanity check (expected " + SANITY_MIN + "-" + SANITY_MAX + " ₹/kg): " + JSON.stringify(parsed)
    );
  }

  return {
    ok: true,
    data: {
      price,
      grade: "RSS4",
      unit: "INR/kg",
      method: "ai-search",
      priceDate: parsed.date || null,
      source: parsed.source || null,
      fetchedAt: new Date().toISOString(),
    },
  };
}

const FALLBACK_SOURCES = [
  "https://rubberboard.gov.in/public",
  "https://www.commoditymarketlive.com/rubber-price",
  "https://kisandeals.com/mandiprices/RUBBER/KERALA/ALL",
  "https://thecanarapost.com/todays-rubber-prices-kottayam-and-international-market/",
];

const PRICE_PATTERN = /RSS[\s-]?(?:4|IV)\b[^0-9₹]{0,80}?(?:₹|Rs\.?|INR)?\s*(\d{2,6}(?:[.,]\d{1,2})?)/i;

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

    const kottayamIdx = text.toLowerCase().lastIndexOf("kottayam");
    const searchText = kottayamIdx >= 0 ? text.slice(kottayamIdx) : text;

    const match = searchText.match(PRICE_PATTERN);
    if (!match) {
      return {
        ok: false,
        data: { source: sourceUrl, error: "price pattern not found on page", excerpt: searchText.slice(0, 800) },
      };
    }

    const rawNumber = match[1].replace(",", ".");
    const price = parseFloat(rawNumber);
    const matchIndex = match.index || 0;
    const context = searchText.slice(Math.max(0, matchIndex - 40), matchIndex + 120);

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
      data: {
        price,
        grade: "RSS4",
        unit: "INR/kg",
        method: "regex-fallback",
        source: sourceUrl,
        fetchedAt: new Date().toISOString(),
        context,
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
