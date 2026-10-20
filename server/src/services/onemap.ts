const TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";

// OneMap tokens last about three days. Re-authenticating on every routing
// request would be both slow and needless, so one token is held in memory
// and reused until it's close to expiring - the same cache-with-TTL shape
// used for LTA lots and Popular Times, with the window set by the token's
// own stated expiry rather than a figure we pick.
let cached: { token: string; expiresAtMs: number } | null = null;

// Refreshed a minute early so a token can't lapse mid-request.
const EXPIRY_MARGIN_MS = 60 * 1000;

// fetch() has no timeout of its own, so without this an unresponsive OneMap
// holds the request open indefinitely - the app shows a spinner forever
// rather than an error it can retry from, and the connection is tied up the
// whole time. Public transport routing is the slow one, hence the headroom.
const REQUEST_TIMEOUT_MS = 20 * 1000;

async function fetchToken(): Promise<{ token: string; expiresAtMs: number }> {
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "ONEMAP_EMAIL / ONEMAP_PASSWORD are not set in server/.env - register a free account at onemap.gov.sg to get them."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`OneMap authentication failed (${res.status}) - check ONEMAP_EMAIL/ONEMAP_PASSWORD.`);
  }

  const payload = (await res.json()) as { access_token?: string; expiry_timestamp?: string | number };
  if (!payload.access_token) {
    throw new Error("OneMap authentication returned no access_token.");
  }

  // expiry_timestamp is unix seconds (as a string in practice). If it's
  // missing or unparseable, fall back to an hour - far short of the real
  // three days, so the only cost is re-authenticating more often.
  const expirySeconds = Number(payload.expiry_timestamp);
  const expiresAtMs = Number.isFinite(expirySeconds)
    ? expirySeconds * 1000
    : Date.now() + 60 * 60 * 1000;

  return { token: payload.access_token, expiresAtMs };
}

/**
 * Returns a OneMap access token, reusing the cached one until it is about to expire.
 * @returns a valid access token
 */
export async function getOneMapToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAtMs - EXPIRY_MARGIN_MS) {
    return cached.token;
  }
  cached = await fetchToken();
  return cached.token;
}

// Any OneMap call that needs authentication goes through here so the token
// lifecycle lives in exactly one place. A 401 means the cached token was
// rejected despite looking unexpired (revoked, or the account's password
// changed), so it's dropped and the call retried once with a fresh one.
/**
 * Makes an authenticated GET request to OneMap, retrying once with a new token if
 * the current one is rejected.
 * @param url - the full OneMap API URL
 * @returns the parsed JSON response
 */
export async function oneMapGet<T>(url: string): Promise<T> {
  const attempt = async (token: string) =>
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let res = await attempt(await getOneMapToken());
  if (res.status === 401) {
    cached = null;
    res = await attempt(await getOneMapToken());
  }

  if (!res.ok) {
    throw new Error(`OneMap request failed (${res.status}): ${url}`);
  }
  return (await res.json()) as T;
}
