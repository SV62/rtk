// Cloudflare Worker: fetches Kerala rubber price pages server-side
// (bypassing the browser's CORS restriction, which is why the frontend
// can't just `fetch()` these source pages directly) and word-searches the
// fetched text for an RSS4 price, returning a small JSON object.
//
// STATUS: two sources tried and ruled out, tried live against real pages:
// - kisandeals.com returns HTTP 403 to server-side requests (bot
//   protection) — left in as a first attempt in case that ever changes.
// - thecanarapost.com's RSS4 mention is the *international* (Bangkok)
//   price; the actual Kottayam domestic figure isn't present as text
//   anywhere on the page (confirmed by dumping the full page text after
//   the "Kottayam" mention — nothing but nav/footer/newsletter content),
//   so it's almost certainly shown there as an image, not scrapable.
//
// rubberboard.gov.in/public added as a third attempt — the official
// government source, so if it publishes prices as text at all this
// should be the most trustworthy one. Not yet verified against real
// output (same network restriction as the others).
const SOURCES = [
  "https://rubberboard.gov.in/public",
  "https://kisandeals.com/mandiprices/RUBBER/KERALA/ALL",
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

    // Restrict the search to text after the last "Kottayam" mention, so we
    // land on the domestic Kottayam table rather than an earlier
    // international-market mention of the same grade label.
    const kottayamIdx = text.toLowerCase().lastIndexOf("kottayam");
    const searchText = kottayamIdx >= 0 ? text.slice(kottayamIdx) : text;

    const match = searchText.match(PRICE_PATTERN);
    if (!match) {
      // TEMP DEBUG: dump much more text than usual so we can see whether
      // the domestic price appears anywhere as text at all, in a different
      // format than PRICE_PATTERN expects.
      return {
        ok: false,
        data: { source: sourceUrl, error: "price pattern not found on page", excerpt: searchText.slice(0, 4000) },
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
