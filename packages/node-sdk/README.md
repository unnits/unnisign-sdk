# UnniSign Node SDK

Node.js 22+ client for creating UnniSign signing procedures. TypeScript declarations are included. This package uses ES modules.

```sh
npm install @unnits/unnisign-sdk
```

## Create a signing procedure

```ts
import { readFile } from "node:fs/promises";
import { UnniSignClient } from "@unnits/unnisign-sdk";

const client = new UnniSignClient({
  baseUrl: "https://sign.unni.cloud",
  accessToken: process.env.UNNISIGN_ACCESS_TOKEN ?? "",
});

const procedure = await client.createSigningProcedure({
  singleDeviceSign: true,
  webhookUrl: "https://your-app.example/webhooks/unnisign",
  documents: [{
    uuid: "308c8e0a-dcc0-4db1-a340-d5fc7a17d771",
    file: new Blob([await readFile("./contract.pdf")], { type: "application/pdf" }),
    filename: "contract.pdf",
    pdfTitle: "Contract",
  }],
});

// Store the procedure UUID and use signing_links to direct your signers.
const procedureUuid = procedure.uuid;
const signingLinks = procedure.signing_links;
```

`uuid` refers to an **existing document configured in the client's workspace**, not a new random UUID. Each file must be a valid PDF, at most 10 MB. Both callback URLs must match the host configured for the client in UnniSign. `baseUrl` is the deployment root, not the API URL.

### Optional fields

```ts
const procedure = await client.createSigningProcedure({
  singleDeviceSign: true,
  webhookUrl: "https://your-app.example/webhooks/unnisign",
  documents,
  headless: true,
  redirectUrl: "https://your-app.example/finished",
  clientMetadata: { orderId: "order-123" },
  clientHeaders: { "X-Trace-Id": "trace-123" },
  settings: [{ name: "your-setting-name", value: "your-setting-value" }],
  presetId: 42,
});
```

Here `documents` is the same document array shown above; settings and presets must be valid for your deployment. JSON fields are encoded by the SDK; do not pre-encode them. `false` booleans are sent as `0`. Omitted options are not sent.

Headless signing requires certificates/settings configured on the server. It returns `202 Accepted` with `signing_links: []`; this does not mean signing is complete. Responses retain API field names:

```ts
interface SigningProcedure {
  uuid: string;
  redirect_url: string | null;
  signing_links: { value: string; expires_at: string; signer?: string }[];
}
```

### Errors and timeouts

```ts
import { ApiError, UnexpectedResponseError } from "@unnits/unnisign-sdk";

try {
  await client.createSigningProcedure(request);
} catch (error) {
  if (error instanceof ApiError) {
    // error.statusCode: HTTP status (e.g. 401, 422, 429).
    // error.responseBody: unmodified body, including Laravel validation details.
  } else if (error instanceof UnexpectedResponseError) {
    // A successful HTTP response contained invalid JSON or an unexpected shape.
  } else {
    // Native fetch/network/timeout errors or invalid input; propagate or handle.
    throw error;
  }
}
```

`request` is a `CreateSigningProcedure` object as shown above. Error bodies and signing links may contain sensitive information; avoid logging them. No automatic retries or redirects are performed. Creation is not guaranteed idempotent: a timeout does not establish that nothing was created.

The default request timeout is 30 seconds, including reading the response body. Set `timeoutMs` in the client options to override it. An optional `fetch` implementation can be injected for custom networking or tests.

This is a **server-side SDK**. Keep access tokens out of browser bundles.

## Development

From the monorepo root:

```sh
npm ci
npm run check
npm pack --workspace=@unnits/unnisign-sdk --dry-run
```

Publishing requires npm account/organization setup; see the monorepo README.
