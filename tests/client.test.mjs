import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Sandfish, SandfishError, OperationError, SubmitUrlRequestToJSON, SubmitUrlRequestFromJSON, SearchResponseFromJSON } from "../dist/index.js";

const fixture = JSON.parse(readFileSync(new URL("../testdata/contract.json", import.meta.url)));
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

test("serialization preserves null and omitted fields", () => {
  assert.equal(SubmitUrlRequestFromJSON({ url: "https://example.com/", visibility: null }).visibility, null);
  const omitted = JSON.parse(JSON.stringify(SubmitUrlRequestToJSON({ url: "https://example.com/" })));
  const explicit = JSON.parse(JSON.stringify(SubmitUrlRequestToJSON({ url: "https://example.com/", visibility: null })));
  assert.equal(Object.hasOwn(omitted, "visibility"), false);
  assert.equal(explicit.visibility, null);
});

test("submission sends the key and wire field names", async () => {
  const client = new Sandfish({ apiKey: "ak_example", baseUrl: "https://example.test", fetch: async (url, init) => {
    assert.equal(url, "https://example.test/api/analyses");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer ak_example");
    assert.deepEqual(JSON.parse(init.body), { url: "https://example.com/", visibility: "public" });
    return json(fixture.accepted, 202);
  }});
  const accepted = await client.analyses.submitUrl({ submitUrlRequest: { url: "https://example.com/", visibility: "public" }});
  assert.equal(accepted.operationId, fixture.accepted.operation_id);
});

test("polling ends at success", async () => {
  let calls = 0;
  const client = new Sandfish({ fetch: async () => json({ ...fixture.operation, status: ++calls === 1 ? "running" : "succeeded" }) });
  const operation = await client.waitForOperation(fixture.operation.id, { intervalMs: 1 });
  assert.equal(calls, 2);
  assert.equal(operation.finishedAt, null);
});

for (const status of ["failed", "cancelled"]) {
  test(`polling reports ${status}`, async () => {
    const client = new Sandfish({ fetch: async () => json({ ...fixture.operation, status }) });
    await assert.rejects(client.waitForOperation(fixture.operation.id), error => error instanceof OperationError && error.operation.status === status);
  });
}

test("polling accepts caller cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const client = new Sandfish({ fetch: async () => { throw new Error("The request must not start"); } });
  await assert.rejects(client.waitForOperation(fixture.operation.id, { signal: controller.signal }), { name: "AbortError" });
});

test("reads retry and submissions are sent once", async () => {
  const methods = [];
  const client = new Sandfish({ fetch: async (_, init) => {
    methods.push(init.method);
    if (methods.length === 2) return json(fixture.operation);
    return json({ error: { code: "rate_limited", message: "Wait" } }, 429, { "Retry-After": "0", "X-Request-ID": "request-fixture" });
  }});
  await client.operations.getOperation({ operationId: fixture.operation.id });
  await assert.rejects(client.analyses.submitUrl({ submitUrlRequest: { url: "https://example.com/" } }), error => error instanceof SandfishError && error.status === 429 && error.requestId === "request-fixture");
  assert.deepEqual(methods, ["GET", "GET", "POST"]);
});

test("search decodes the group discriminator", () => {
  const search = SearchResponseFromJSON(fixture.search);
  assert.equal(search.items[0].type, "group");
  assert.equal(search.items[0].sourceFilename, null);
  assert.equal(search.items[0].match.value, "https://example.com/");
});

test("pagination follows the returned page limit", async () => {
  const offsets = [];
  const client = new Sandfish({ fetch: async url => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    offsets.push(offset);
    return json({ items: [fixture.analysis], limit: 1, offset, total: 2 });
  }});
  const analyses = [];
  for await (const item of client.iterAnalyses({ limit: 10 })) analyses.push(item);
  assert.deepEqual(offsets, [0, 1]);
  assert.equal(analyses.length, 2);
  assert.equal(analyses[0].currentEvaluation, null);
});

test("multipart upload keeps file bytes", async () => {
  const client = new Sandfish({ apiKey: "ak_example", fetch: async (_, init) => {
    assert.ok(init.body instanceof FormData);
    assert.equal(await init.body.get("file").text(), "<html>example</html>");
    assert.equal(new Headers(init.headers).has("Content-Type"), false);
    return json(fixture.accepted, 202);
  }});
  await client.analyses.submitWacz({ file: new Blob(["<html>example</html>"], { type: "text/html" }), visibility: "public" });
});

test("downloads expose a byte stream and handle HTML errors", async () => {
  const client = new Sandfish({ maxRetries: 0, fetch: async url => url.endsWith("/screenshot")
    ? new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0xff]))
    : new Response("<html>Proxy error</html>", { status: 502, headers: { "X-Request-ID": "proxy-fixture" } }) });
  const response = await client.download("/api/analyses/example/screenshot");
  assert.ok(response.body instanceof ReadableStream);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47, 0, 0xff]);
  await assert.rejects(client.download("/api/analyses/example/wacz"), error => error instanceof SandfishError && error.requestId === "proxy-fixture");
});
