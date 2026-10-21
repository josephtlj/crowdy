import type { Venue } from "../types/venue";

// "rd" matches addresses stored as "road".
const ABBREVIATIONS: Record<string, string> = {
  rd: "road",
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  dr: "drive",
  ln: "lane",
  pl: "place",
};

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ABBREVIATIONS[token] ?? token)
    .join(" ");
}

// "SINGAPORE" is on almost every mall address and "Station" on every station's,
// so a query of "s" would match all of them.
const GENERIC_ADDRESS_WORDS = new Set(["singapore", "station"]);

function addressForMatch(address: string): string {
  return address
    .split(" ")
    .filter((token) => !GENERIC_ADDRESS_WORDS.has(token))
    .join(" ");
}

function isNumeric(token: string): boolean {
  return /^\d+$/.test(token);
}

// One insertion, deletion, or substitution. Used for words only, not postal codes.
function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > 1) return false;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length] <= 1;
}

// Matches whole words or the start of a word only - matching anywhere inside
// a word made "ion" hit every "Station" and "Junction".
function tokenHits(queryToken: string, haystackTokens: string[]): "exact" | "prefix" | "fuzzy" | null {
  if (haystackTokens.includes(queryToken)) return "exact";
  let fuzzy = false;
  for (const token of haystackTokens) {
    if (token.startsWith(queryToken)) return "prefix";
    if (
      !isNumeric(queryToken) &&
      !isNumeric(token) &&
      queryToken.length >= 4 &&
      token.length >= 4 &&
      editDistanceAtMostOne(queryToken, token)
    ) {
      fuzzy = true;
    }
  }
  return fuzzy ? "fuzzy" : null;
}

// Lower rank is a stronger hit. null means no match.
// 0 exact postal code, 1 postal prefix, 2 name prefix, 3 name tokens,
// 4 address tokens, 5 a one-character typo in a word.
/**
 * Scores how well a venue matches a search by name, address or postal code.
 * @param venue - the venue's name, address and postal code
 * @param rawQuery - what the user typed
 * @returns a rank (lower is a better match), or null if it doesn't match
 */
export function venueSearchRank(venue: Pick<Venue, "name" | "address" | "postalCode">, rawQuery: string): number | null {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return null;

  const digitQuery = query.replace(/\s/g, "");
  if (/^\d+$/.test(digitQuery) && venue.postalCode?.startsWith(digitQuery)) {
    return venue.postalCode === digitQuery ? 0 : 1;
  }

  const normalizedQuery = normalize(query);
  const name = normalize(venue.name);
  const address = addressForMatch(normalize(venue.address));
  const queryCompact = normalizedQuery.replace(/ /g, "");
  const nameCompact = name.replace(/ /g, "");

  // Joined names only match at the start, so "vivocity" hits "Vivo City"
  // but "amk" does not hit "Sam Kee LRT" ("samkeelrt").
  if (name.startsWith(normalizedQuery) || (queryCompact.length >= 2 && nameCompact.startsWith(queryCompact))) {
    return 2;
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const nameTokens = name.split(" ");
  const addressTokens = address.split(" ");
  let usedAddress = false;
  let usedFuzzy = false;

  for (const token of queryTokens) {
    const nameHit = tokenHits(token, nameTokens);
    if (nameHit === "exact" || nameHit === "prefix") continue;
    if (nameHit === "fuzzy") {
      usedFuzzy = true;
      continue;
    }
    const addressHit = tokenHits(token, addressTokens);
    if (addressHit === "exact" || addressHit === "prefix") {
      usedAddress = true;
      continue;
    }
    if (addressHit === "fuzzy") {
      usedAddress = true;
      usedFuzzy = true;
      continue;
    }
    return null;
  }

  if (usedFuzzy) return 5;
  if (usedAddress) return 4;
  return 3;
}
