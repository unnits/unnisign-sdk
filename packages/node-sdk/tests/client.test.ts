import { describe, expect, it, vi } from "vitest";
import { ApiError, UnexpectedResponseError, UnniSignClient } from "../src/index.js";
import type { CreateSigningProcedure } from "../src/index.js";

const procedure = {
  uuid: "e9709f80-a33b-4b5e-a1a6-c2cad08466e3",
  redirect_url: "https://sign.example.test/sign",
  signing_links: [
    { value: "https://sign.example.test/sign?token=secret", expires_at: "2026-12-01T12:00:00Z" },
    { value: "https://sign.example.test/sign?token=next", expires_at: "2026-12-01T12:00:00Z", signer: "Jane" },
  ],
};

function input(): CreateSigningProcedure {
  return {
    documents: [{
      uuid: "308c8e0a-dcc0-4db1-a340-d5fc7a17d771",
      file: new Blob(["%PDF-1.7\nbinary\0data"], { type: "application/pdf" }),
      filename: "contract.pdf",
    }],
    singleDeviceSign: true,
    webhookUrl: "https://client.example.test/webhook",
  };
}

function setup(response = new Response(JSON.stringify(procedure))) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  const client = new UnniSignClient({
    baseUrl: "https://sign.example.test/",
    accessToken: "test-token",
    fetch,
  });

  return { client, fetch };
}

describe("creating signing procedures", () => {
  it("sends authenticated multipart data with PDF bytes and returns signing links", async () => {
    const { client, fetch } = setup();

    await expect(client.createSigningProcedure(input())).resolves.toEqual(procedure);

    const call = fetch.mock.calls[0]!;
    expect(call[0]).toBe("https://sign.example.test/api/v1/signing-procedures");
    expect(call[1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer test-token", Accept: "application/json" },
      redirect: "manual",
    });
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);

    // Round-trip through the native encoder/parser rather than only inspecting FormData.
    const request = new Request(call[0], call[1]);
    expect(request.headers.get("content-type")).toContain("multipart/form-data; boundary=");

    const form = await request.formData();
    expect(form.get("single_device_sign")).toBe("1");
    expect(form.get("webhook_url")).toBe("https://client.example.test/webhook");
    expect(form.get("documents[0][uuid]")).toBe(input().documents[0]?.uuid);
    expect(form.has("headless")).toBe(false);
    expect(form.has("client_metadata")).toBe(false);

    const file = form.get("documents[0][file]");
    expect(file).toBeInstanceOf(File);

    if (!(file instanceof File)) {
      throw new Error("Expected an uploaded file.");
    }

    expect(file.name).toBe("contract.pdf");
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.7\nbinary\0data");
  });

  it("serializes optional fields, multiple documents, false booleans, and JSON", async () => {
    const { client, fetch } = setup();
    const first = input().documents[0]!;

    await client.createSigningProcedure({
      ...input(),
      documents: [
        { ...first, pdfTitle: "Smlouva — český název" },
        { ...first, uuid: "4008ac49-2308-49f2-ac94-af0a116ebdd2", filename: "second.pdf" },
      ],
      singleDeviceSign: false,
      headless: false,
      redirectUrl: "https://client.example.test/return",
      clientMetadata: { order: 42, nested: [true, null] },
      clientHeaders: { "X-Trace-Id": "trace" },
      settings: [{ name: "locale", value: "cs" }],
      presetId: 42,
    });

    const body = fetch.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("single_device_sign")).toBe("0");
    expect(body.get("headless")).toBe("0");
    expect(body.get("redirect_url")).toBe("https://client.example.test/return");
    expect(body.get("client_metadata")).toBe('{"order":42,"nested":[true,null]}');
    expect(body.get("client_headers")).toBe('{"X-Trace-Id":"trace"}');
    expect(body.get("settings")).toBe('[{"name":"locale","value":"cs"}]');
    expect(body.get("preset_id")).toBe("42");
    expect(body.get("documents[0][pdfTitle]")).toBe("Smlouva — český název");
    expect(body.get("documents[1][uuid]")).toBe("4008ac49-2308-49f2-ac94-af0a116ebdd2");
    expect(body.has("documents[1][file]")).toBe(true);
    expect(body.has("documents[1][pdfTitle]")).toBe(false);
  });

  it("accepts asynchronous headless responses with empty signing links", async () => {
    const result = { ...procedure, redirect_url: null, signing_links: [] };
    const { client, fetch } = setup(new Response(JSON.stringify(result), { status: 202 }));

    await expect(client.createSigningProcedure({ ...input(), headless: true })).resolves.toEqual(result);
    expect((fetch.mock.calls[0]?.[1]?.body as FormData).get("headless")).toBe("1");
  });

  it("preserves explicitly empty JSON collections", async () => {
    const { client, fetch } = setup();

    await client.createSigningProcedure({ ...input(), clientMetadata: {}, clientHeaders: [], settings: [] });

    const body = fetch.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("client_metadata")).toBe("{}");
    expect(body.get("client_headers")).toBe("[]");
    expect(body.get("settings")).toBe("[]");
  });

  it.each([301, 401, 403, 422, 429, 500])("exposes HTTP %s without retrying the creation request", async (status) => {
    const body = '{"message":"Validation failed","errors":{"documents.0.uuid":["Unknown document"]}}';
    const { client, fetch } = setup(new Response(body, { status }));
    const error = await client.createSigningProcedure(input()).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: status, responseBody: body });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves a non-JSON API failure", async () => {
    const { client } = setup(new Response("<html>Gateway unavailable</html>", { status: 502 }));

    await expect(client.createSigningProcedure(input())).rejects.toMatchObject({
      statusCode: 502,
      responseBody: "<html>Gateway unavailable</html>",
    });
  });

  it.each([
    "not JSON",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...procedure, redirect_url: undefined }),
    JSON.stringify({ ...procedure, uuid: 123 }),
    JSON.stringify({ ...procedure, signing_links: {} }),
    JSON.stringify({ ...procedure, signing_links: [{ value: "url" }] }),
    JSON.stringify({ ...procedure, signing_links: [{ value: "url", expires_at: "date", signer: null }] }),
  ])("rejects malformed successful responses: %s", async (body) => {
    const { client } = setup(new Response(body));

    await expect(client.createSigningProcedure(input())).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it("propagates networking failures without retries", async () => {
    const { client, fetch } = setup();
    const error = new TypeError("Connection failed");
    fetch.mockRejectedValue(error);

    await expect(client.createSigningProcedure(input())).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects empty document lists before making a request", async () => {
    const { client, fetch } = setup();

    await expect(client.createSigningProcedure({ ...input(), documents: [] })).rejects.toThrow("At least one document");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("supports deployments under a URL path", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(procedure));
    const client = new UnniSignClient({ baseUrl: "https://example.test/signing/", accessToken: "token", fetch });

    await client.createSigningProcedure(input());

    expect(fetch.mock.calls[0]?.[0]).toBe("https://example.test/signing/api/v1/signing-procedures");
  });
});

describe("client configuration", () => {
  it.each([
    "not a URL",
    "ftp://example.test",
    "https://user:pass@example.test",
    "https://example.test?token=secret",
    "https://example.test#fragment",
  ])("rejects invalid deployment roots: %s", (baseUrl) => {
    expect(() => new UnniSignClient({ baseUrl, accessToken: "token" })).toThrow();
  });

  it.each(["", " ", "token\r\ninjected"])("rejects invalid access tokens", (accessToken) => {
    expect(() => new UnniSignClient({ baseUrl: "https://example.test", accessToken })).toThrow("accessToken");
  });

  it.each([0, -1, NaN, Infinity, 0.5, 2_147_483_648])("rejects invalid timeouts: %s", (timeoutMs) => {
    expect(() => new UnniSignClient({
      baseUrl: "https://example.test",
      accessToken: "token",
      timeoutMs,
    })).toThrow("timeoutMs");
  });
});
