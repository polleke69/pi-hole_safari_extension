import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractHostname,
  normalizeBaseUrl,
  createSession,
  addAllowExactDomain,
  removeAllowExactDomain,
  isDomainAlreadyOnAllowlistError,
  fetchExactAllowStatus,
} from "../extension/lib/pihole-client.js";

describe("extractHostname", () => {
  it("returns hostname for https URL", () => {
    expect(extractHostname("https://www.example.com/foo?x=1")).toBe(
      "www.example.com",
    );
  });

  it("returns hostname for http URL with port", () => {
    expect(extractHostname("http://pi.hole:8080/admin")).toBe("pi.hole");
  });

  it("throws for invalid URL", () => {
    expect(() => extractHostname("not a url")).toThrow();
  });
});

describe("normalizeBaseUrl", () => {
  it("trims trailing slash", () => {
    expect(normalizeBaseUrl("https://pi.hole/")).toBe("https://pi.hole");
  });

  it("preserves pathless URL", () => {
    expect(normalizeBaseUrl("http://192.168.1.2")).toBe("http://192.168.1.2");
  });
});

describe("createSession", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips network when password is empty", async () => {
    const out = await createSession("https://pi.hole", "", fetchMock);
    expect(out).toEqual({ sid: null, csrf: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns sid when auth succeeds", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session: { valid: true, sid: "abc123", csrf: "csrf1", validity: 300 },
      }),
    });

    const out = await createSession("https://pi.hole", "secret", fetchMock);
    expect(out.sid).toBe("abc123");
    expect(out.csrf).toBe("csrf1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pi.hole/api/auth",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({ password: "secret" }),
      }),
    );
  });

  it("throws on 401", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { key: "unauthorized", message: "Unauthorized" },
      }),
    });

    await expect(
      createSession("https://pi.hole", "bad", fetchMock),
    ).rejects.toThrow(/Unauthorized|401/);
  });
});

describe("isDomainAlreadyOnAllowlistError", () => {
  it("detects Pi-hole UNIQUE domainlist response", () => {
    expect(
      isDomainAlreadyOnAllowlistError({
        item: "x.com",
        error:
          "UNIQUE constraint failed: domainlist.domain, domainlist.type",
      }),
    ).toBe(true);
  });

  it("detects error in hint.sql_msg", () => {
    expect(
      isDomainAlreadyOnAllowlistError({
        item: "x.com",
        hint: {
          sql_msg:
            "UNIQUE constraint failed: domainlist.domain, domainlist.type",
        },
      }),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(
      isDomainAlreadyOnAllowlistError({
        error: "something else",
      }),
    ).toBe(false);
  });
});

describe("addAllowExactDomain", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs allow/exact with sid header", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        processed: { success: [{ item: "example.com" }], errors: [] },
      }),
    });

    const res = await addAllowExactDomain(
      "https://pi.hole",
      "sidvalue",
      "example.com",
      { comment: "from Safari", fetchImpl: fetchMock },
    );

    expect(res.success).toEqual([{ item: "example.com" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pi.hole/api/domains/allow/exact",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-FTL-SID": "sidvalue",
        }),
        body: JSON.stringify({
          domain: ["example.com"],
          comment: "from Safari",
        }),
      }),
    );
  });
});

describe("removeAllowExactDomain", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs batchDelete allow/exact with sid", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: async () => "",
    });

    const res = await removeAllowExactDomain(
      "https://pi.hole",
      "sidvalue",
      "example.com",
      { fetchImpl: fetchMock },
    );

    expect(res).toEqual({ removed: true, notFound: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pi.hole/api/domains:batchDelete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-FTL-SID": "sidvalue",
        }),
        body: JSON.stringify([
          { item: "example.com", type: "allow", kind: "exact" },
        ]),
      }),
    );
  });

  it("returns notFound on 404", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "",
    });

    const res = await removeAllowExactDomain(
      "https://pi.hole",
      "sid",
      "missing.test",
      { fetchImpl: fetchMock },
    );
    expect(res).toEqual({ removed: false, notFound: true });
  });

  it("throws on other errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () =>
        JSON.stringify({ error: { message: "database_error" } }),
    });

    await expect(
      removeAllowExactDomain("https://pi.hole", "sid", "x.com", {
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow(/database_error|500/);
  });
});

describe("fetchExactAllowStatus", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GETs /api/domains/allow/exact/{domain} with sid", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        domains: [
          { domain: "example.com", type: "allow", kind: "exact", enabled: true },
        ],
      }),
    });

    const out = await fetchExactAllowStatus(
      "https://pi.hole",
      "sid1",
      "example.com",
      { fetchImpl: fetchMock },
    );
    expect(out).toEqual({ found: true, enabled: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pi.hole/api/domains/allow/exact/example.com",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          "X-FTL-SID": "sid1",
        }),
      }),
    );
  });

  it("returns not found for empty list", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ domains: [] }),
    });

    const out = await fetchExactAllowStatus(
      "https://pi.hole",
      "sid1",
      "missing.com",
    );
    expect(out).toEqual({ found: false, enabled: false });
  });

  it("treats disabled row as not enabled for DNS", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        domains: [
          { domain: "x.com", type: "allow", kind: "exact", enabled: false },
        ],
      }),
    });

    const out = await fetchExactAllowStatus("https://pi.hole", "sid1", "x.com");
    expect(out).toEqual({ found: true, enabled: false });
  });
});
