import { ApiError, UnexpectedResponseError } from "./errors.js";
import type {
  CreateSigningProcedure,
  SigningLink,
  SigningProcedure,
  UnniSignOptions,
} from "./types.js";

export class UnniSignClient {
  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: UnniSignOptions) {
    const url = new URL(options.baseUrl);

    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash
    ) {
      throw new TypeError("baseUrl must be an HTTP(S) deployment root without credentials, query, or fragment.");
    }

    if (!options.accessToken.trim() || /[\r\n]/.test(options.accessToken)) {
      throw new TypeError("accessToken must be non-empty and contain no newlines.");
    }

    const timeoutMs = options.timeoutMs ?? 30_000;

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
      throw new TypeError("timeoutMs must be a positive integer no larger than 2147483647.");
    }

    this.endpoint = `${url.toString().replace(/\/+$/, "")}/api/v1/signing-procedures`;
    this.accessToken = options.accessToken;
    this.timeoutMs = timeoutMs;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async createSigningProcedure(input: CreateSigningProcedure): Promise<SigningProcedure> {
    if (input.documents.length === 0) {
      throw new TypeError("At least one document is required.");
    }

    const body = new FormData();
    body.set("single_device_sign", input.singleDeviceSign ? "1" : "0");
    body.set("webhook_url", input.webhookUrl);

    if (input.headless !== undefined) {
      body.set("headless", input.headless ? "1" : "0");
    }

    if (input.redirectUrl !== undefined) {
      body.set("redirect_url", input.redirectUrl);
    }

    for (const [field, value] of [
      ["client_metadata", input.clientMetadata],
      ["client_headers", input.clientHeaders],
      ["settings", input.settings],
    ] as const) {
      if (value !== undefined) {
        body.set(field, JSON.stringify(value));
      }
    }

    if (input.presetId !== undefined) {
      body.set("preset_id", String(input.presetId));
    }

    input.documents.forEach((document, index) => {
      body.set(`documents[${index}][uuid]`, document.uuid);
      body.set(`documents[${index}][file]`, document.file, document.filename);

      if (document.pdfTitle !== undefined) {
        body.set(`documents[${index}][pdfTitle]`, document.pdfTitle);
      }
    });

    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await response.text();

    if (!response.ok) {
      throw new ApiError(response.status, text);
    }

    let result: unknown;

    try {
      result = JSON.parse(text);
    } catch {
      throw new UnexpectedResponseError();
    }

    if (!isSigningProcedure(result)) {
      throw new UnexpectedResponseError();
    }

    return result;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSigningLink(value: unknown): value is SigningLink {
  return isRecord(value) &&
    typeof value.value === "string" &&
    typeof value.expires_at === "string" &&
    (value.signer === undefined || typeof value.signer === "string");
}

function isSigningProcedure(value: unknown): value is SigningProcedure {
  return isRecord(value) &&
    typeof value.uuid === "string" &&
    (value.redirect_url === null || typeof value.redirect_url === "string") &&
    Array.isArray(value.signing_links) &&
    value.signing_links.every(isSigningLink);
}
