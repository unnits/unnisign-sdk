import { createServer } from "node:http";
import type { RequestListener, Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { ApiError, UnniSignClient } from "../src/index.js";

const servers: Server[] = [];

async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => {
    server.closeAllConnections();

    return new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }));
});

it("creates a procedure over native fetch with real multipart encoding", async () => {
  let received: {
    path: string | undefined;
    authorization: string | undefined;
    contentType: string | undefined;
    body: string;
  } | undefined;
  const baseUrl = await serve((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received = {
        path: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body: Buffer.concat(chunks).toString(),
      };
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end('{"uuid":"procedure-uuid","redirect_url":null,"signing_links":[]}');
    });
  });
  const client = new UnniSignClient({ baseUrl, accessToken: "test-token" });

  const result = await client.createSigningProcedure({
    singleDeviceSign: false,
    webhookUrl: "https://client.example.test/webhook",
    headless: true,
    documents: [{
      uuid: "document-uuid",
      file: new Blob(["%PDF-test\0bytes"], { type: "application/pdf" }),
      filename: "contract.pdf",
    }],
  });

  expect(result).toEqual({ uuid: "procedure-uuid", redirect_url: null, signing_links: [] });
  expect(received?.path).toBe("/api/v1/signing-procedures");
  expect(received?.authorization).toBe("Bearer test-token");
  expect(received?.contentType).toContain("multipart/form-data; boundary=");
  expect(received?.body).toContain('name="single_device_sign"\r\n\r\n0');
  expect(received?.body).toContain('name="headless"\r\n\r\n1');
  expect(received?.body).toContain('name="documents[0][file]"; filename="contract.pdf"');
  expect(received?.body).toContain("%PDF-test\0bytes");
});

it("does not follow redirects or forward credentials to a redirect target", async () => {
  let redirected = false;
  const targetUrl = await serve((_request, response) => {
    redirected = true;
    response.end("{}");
  });
  const baseUrl = await serve((_request, response) => {
    response.writeHead(307, { Location: targetUrl });
    response.end();
  });
  const client = new UnniSignClient({ baseUrl, accessToken: "test-token" });

  await expect(client.createSigningProcedure({
    documents: [{ uuid: "uuid", file: new Blob(["%PDF"]), filename: "contract.pdf" }],
    singleDeviceSign: true,
    webhookUrl: "https://client.example.test/webhook",
  })).rejects.toBeInstanceOf(ApiError);
  expect(redirected).toBe(false);
});

it("times out while waiting for the response body, not only response headers", async () => {
  const baseUrl = await serve((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.flushHeaders();
    // Keep the body unfinished: the client's timeout must abort this read.
  });
  const client = new UnniSignClient({ baseUrl, accessToken: "test-token", timeoutMs: 50 });

  await expect(client.createSigningProcedure({
    documents: [{ uuid: "uuid", file: new Blob(["%PDF"]), filename: "contract.pdf" }],
    singleDeviceSign: true,
    webhookUrl: "https://client.example.test/webhook",
  })).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|TimeoutError/) });
});
