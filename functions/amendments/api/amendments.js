// Cloudflare Pages Function — /amendments/api/amendments
const BASE_URL = "https://api.congress.gov/v3";
const CONGRESS = 119;
const CACHE_KEY = "amendments_v1";
const CACHE_TTL = 60 * 60 * 6; // 6 hours in seconds

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function fetchBillsByType(type, apiKey) {
  const url = `${BASE_URL}/bill/${CONGRESS}/${type}?api_key=${apiKey}&limit=250`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Error fetching ${type}:`, response.status);
    return [];
  }
  const data = await response.json();
  return data.bills || [];
}

async function fetchBillDetails(bill, apiKey) {
  try {
    const url = `${bill.url}&api_key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Detail fetch failed for ${bill.number}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data.bill;
  } catch (err) {
    console.error(`Detail fetch error for ${bill.number}:`, err.message);
    return null;
  }
}

async function processBatch(items, fn, batchSize = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function fetchFreshData(apiKey) {
  const [hjresBills, sjresBills] = await Promise.all([
    fetchBillsByType("hjres", apiKey),
    fetchBillsByType("sjres", apiKey),
  ]);

  const allBills = [...hjresBills, ...sjresBills];

  const amendmentBills = allBills.filter(
    (bill) =>
      bill.title &&
      bill.title.toLowerCase().includes("proposing an amendment to the constitution")
  );

  const amendments = await processBatch(
    amendmentBills,
    async (bill) => {
      const details = await fetchBillDetails(bill, apiKey);
      if (!details) return null;

      const sponsor = details.sponsors?.[0] || {};
      const cosponsorsCount = details.cosponsors?.count ?? 0;

      return {
        number: `${bill.type} ${bill.number}`,
        title: bill.title,
        introducedDate: details.introducedDate,
        sponsor: {
          name: sponsor.fullName || sponsor.name || "Unknown",
          party: sponsor.party || "Unknown",
          state: sponsor.state || "Unknown",
          district: sponsor.district || null,
        },
        status: details.latestAction?.text || "Introduced",
        statusDate: details.latestAction?.actionDate || details.introducedDate,
        cosponsorsCount,
        congressUrl: `https://www.congress.gov/bill/${CONGRESS}th-congress/${bill.type
          .toLowerCase()
          .replace(".", "-")}/${bill.number}`,
      };
    },
    5
  );

  const validAmendments = amendments
    .filter((a) => a !== null)
    .sort((a, b) => new Date(b.introducedDate) - new Date(a.introducedDate));

  return {
    count: validAmendments.length,
    congress: CONGRESS,
    lastUpdated: new Date().toISOString(),
    amendments: validAmendments,
  };
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = context.env.CONGRESS_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "API key not configured" }, 500);
  }

  const kv = context.env.AMENDMENTS_KV;

  // Serve from cache if available
  if (kv) {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) {
        return jsonResponse(JSON.parse(cached));
      }
    } catch (err) {
      console.error("KV read error:", err.message);
    }
  }

  // Cache miss — fetch fresh data
  try {
    const data = await fetchFreshData(apiKey);

    // Write to KV (non-blocking — don't let a KV failure break the response)
    if (kv) {
      context.waitUntil(
        kv.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL })
          .catch((err) => console.error("KV write error:", err.message))
      );
    }

    return jsonResponse(data);

  } catch (error) {
    console.error("Error fetching amendments:", error);
    return jsonResponse({ error: "Failed to fetch amendments", detail: error?.message || String(error) }, 500);
  }
}
