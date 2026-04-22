/**
 * Pi-hole v6 API helpers (session + allow/exact domain).
 * @see https://docs.pi-hole.net/api/
 */

export function normalizeBaseUrl(url) {
  const u = String(url || "").trim();
  if (!u) return u;
  return u.replace(/\/+$/, "");
}

export function extractHostname(tabUrl) {
  const u = new URL(tabUrl);
  return u.hostname;
}

/** Pi-hole returns this when the domain is already on the same list (not a real failure). */
const UNIQUE_DOMAINLIST = "domainlist.domain, domainlist.type";

export function isDomainAlreadyOnAllowlistError(entry) {
  if (!entry || typeof entry !== "object") return false;
  const parts = [
    entry.error,
    entry.message,
    entry.hint?.sql_msg,
    typeof entry.hint === "string" ? entry.hint : null,
  ].filter((x) => typeof x === "string");
  const text = parts.join(" ");
  return (
    text.includes("UNIQUE constraint failed") && text.includes(UNIQUE_DOMAINLIST)
  );
}

export async function createSession(baseUrl, password, fetchImpl = fetch) {
  const root = normalizeBaseUrl(baseUrl);
  const pw = password == null ? "" : String(password);
  if (!pw) {
    return { sid: null, csrf: null };
  }

  const res = await fetchImpl(`${root}/api/auth`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: pw }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      data?.error?.message || `Pi-hole auth failed (${res.status})`;
    throw new Error(msg);
  }

  const sid = data?.session?.sid ?? null;
  const csrf = data?.session?.csrf ?? null;
  if (!sid) {
    throw new Error("Geen session id ontvangen van Pi-hole.");
  }
  return { sid, csrf };
}

export async function addAllowExactDomain(
  baseUrl,
  sid,
  domain,
  options = {},
) {
  const { comment = "", fetchImpl = fetch } = options;
  const root = normalizeBaseUrl(baseUrl);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (sid) {
    headers["X-FTL-SID"] = sid;
  }

  const res = await fetchImpl(`${root}/api/domains/allow/exact`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      domain: [domain],
      comment: comment || "",
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      data?.error?.message || `Pi-hole domain add failed (${res.status})`;
    throw new Error(msg);
  }

  return {
    success: data?.processed?.success ?? [],
    errors: data?.processed?.errors ?? [],
    raw: data,
  };
}

async function readJsonBody(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Remove an exact domain from the allowlist (Pi-hole v6 batch delete).
 * @returns {{ removed: boolean, notFound: boolean }}
 */
export async function removeAllowExactDomain(
  baseUrl,
  sid,
  domain,
  options = {},
) {
  const { fetchImpl = fetch } = options;
  const root = normalizeBaseUrl(baseUrl);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (sid) {
    headers["X-FTL-SID"] = sid;
  }

  const res = await fetchImpl(`${root}/api/domains:batchDelete`, {
    method: "POST",
    headers,
    body: JSON.stringify([{ item: domain, type: "allow", kind: "exact" }]),
  });

  if (res.status === 204) {
    return { removed: true, notFound: false };
  }

  if (res.status === 404) {
    return { removed: false, notFound: true };
  }

  const data = await readJsonBody(res);

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      `Pi-hole domain remove failed (${res.status})`;
    throw new Error(msg);
  }

  if (data?.error) {
    const msg =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || "Verwijderen mislukt";
    throw new Error(msg);
  }

  return { removed: true, notFound: false };
}

/**
 * Read exact-allowlist state for a domain (GET /api/domains/allow/exact/{domain}).
 * @returns {Promise<{ found: boolean, enabled: boolean }>}
 */
export async function fetchExactAllowStatus(
  baseUrl,
  sid,
  domain,
  options = {},
) {
  const { fetchImpl = fetch } = options;
  const root = normalizeBaseUrl(baseUrl);
  const path = `${root}/api/domains/allow/exact/${encodeURIComponent(domain)}`;
  const headers = {
    Accept: "application/json",
  };
  if (sid) {
    headers["X-FTL-SID"] = sid;
  }

  const res = await fetchImpl(path, { method: "GET", headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      data?.error?.message || `Pi-hole read allowlist failed (${res.status})`;
    throw new Error(msg);
  }

  const list = Array.isArray(data?.domains) ? data.domains : [];
  const want = String(domain).toLowerCase();
  const row = list.find(
    (d) =>
      d && typeof d.domain === "string" && d.domain.toLowerCase() === want,
  );

  if (!row) {
    return { found: false, enabled: false };
  }
  const enabled = row.enabled !== false;
  return { found: true, enabled };
}
