# Sandfish TypeScript and JavaScript SDK

The official Fetch-based client for the [Sandfish API](https://sandfi.sh/docs#api).
The package includes JavaScript modules and TypeScript declarations.

**Preview:** the npm package name is `@sandfi-sh/sdk`.
Node.js 22 or later is required for the examples.

## Install

```sh
npm install @sandfi-sh/sdk
```

Create an API key at <https://sandfi.sh/account/api>.

## Submit and wait

```typescript
import { Sandfish } from "@sandfi-sh/sdk";

const client = new Sandfish({ apiKey: process.env.SANDFISH_API_KEY });
const accepted = await client.analyses.submitUrl({
  submitUrlRequest: { url: "https://example.com/", visibility: "public" },
});
await client.waitForOperation(accepted.operationId, { timeoutMs: 300_000 });
const analysis = await client.analyses.getAnalysis({ analysisId: accepted.id });
console.log(analysis.currentEvaluation);
```

Models use camelCase properties. The generated client converts them to the
API's wire field names. Explicit null values remain distinct from omitted values.

## Pagination and uploads

```typescript
for await (const analysis of client.iterAnalyses({ limit: 50 })) {
  console.log(analysis.id, analysis.status);
}

const uploaded = await client.analyses.submitWacz({
  file: new Blob(["<html><title>Example</title></html>"], { type: "text/html" }),
  visibility: "public",
});
```

`submitWacz` accepts HTML or WACZ content. `analysisGroups.submitEml` accepts EML.
The client sets multipart boundaries automatically.

## Streaming and cancellation

```typescript
const controller = new AbortController();
const response = await client.download(
  `/api/analyses/${accepted.id}/wacz`, controller.signal,
);
// Pipe response.body to your application's file or storage writer.
```

`download` returns a standard `Response` with a readable byte stream. Generated
download methods return blobs. Pass a signal to polling or pagination helpers,
or as the second argument to a generated method: `{ signal }`.

## Configuration and errors

`Sandfish` accepts `apiKey`, `baseUrl`, `timeoutMs`, `maxRetries`, and a custom
`fetch`. Defaults are `https://sandfi.sh`, 30 seconds, and two read retries.
The server URL must omit `/api`. Omit the key for public reads. Keep account
API keys in server-side code.

Reads retry HTTP 429, 502, 503, and 504. Retries respect `Retry-After` and the
request deadline. Submissions are sent once.

`SandfishError` exposes `status`, `code`, `details`, `requestId`, and
`retryAfter`. It also handles non-JSON proxy errors. `OperationError` retains a
failed or cancelled operation.

An operation's success does not establish a verdict. `currentEvaluation` can
be null. Read completeness and supporting evidence with the verdict.

## Development

```sh
git clone https://github.com/sandfi-sh/sandfish-typescript.git
cd sandfish-typescript
npm ci
npm test
npm pack
```

`src/generated` is generated from the public contract. The
[generation guide](https://github.com/sandfi-sh/openapi) owns updates.
`.sdk-generated.json` records source hashes and generated file ownership.
Read the [maintenance guide](https://github.com/Sandfi-sh/openapi/blob/main/MAINTAINING.md)
for change ownership and the
[release guide](https://github.com/Sandfi-sh/openapi/blob/main/RELEASING.md)
for npm publication.

[Examples](https://github.com/sandfi-sh/examples) ·
[API documentation](https://sandfi.sh/docs#api) ·
[Report a problem](https://github.com/sandfi-sh/sandfish-typescript/issues)

## License

MIT. See [LICENSE](LICENSE).
