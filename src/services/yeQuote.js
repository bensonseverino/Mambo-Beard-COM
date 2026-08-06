const YE_QUOTE_URL = "https://api.kanye.rest";

/** Fallback quote used when the API is unreachable. */
export const FALLBACK_QUOTE = "Everything I'm not made me everything I am.";

/**
 * Fetch today's Kanye quote from https://api.kanye.rest.
 *
 * Validates the response and returns only the quote string.
 * Throws descriptive errors so callers can fall back gracefully.
 *
 * @returns {Promise<string>} The quote text.
 */
export const getYeQuote = async () => {
  let response;

  try {
    response = await fetch(YE_QUOTE_URL);
  } catch {
    throw new Error("Unable to reach the quote service.");
  }

  if (!response.ok) {
    throw new Error(`Quote service responded with ${response.status}.`);
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Quote service returned an invalid response.");
  }

  if (!data || typeof data.quote !== "string" || !data.quote.trim()) {
    throw new Error("Quote service returned an empty quote.");
  }

  return data.quote.trim();
};
