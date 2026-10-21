import {
  ActorsApi, AnalysesApi, AnalysisGroupsApi, BehaviorEventsApi, BrandsApi,
  EmailAnalysesApi, ExecutionProfilesApi, FaviconsApi, IdentifiersApi,
  InfrastructureApi, InteractionsApi, JavascriptFunctionsApi, OperationsApi,
  PayloadsApi, PhishingKitsApi, RequestsApi, RulesApi, SearchApi, SignalsApi,
  StatsApi, TlsCertificatesApi, UsageApi, Configuration,
} from "./generated/index.js";
import type { AnalysisSummary, OperationOut, ListAnalysesRequest } from "./generated/index.js";

export interface SandfishOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

export class SandfishError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details: unknown;
  readonly retryAfter?: string;

  constructor(response: Response, body: unknown) {
    const error = body && typeof body === "object" && "error" in body
      && body.error && typeof body.error === "object"
      ? body.error as Record<string, unknown> : {};
    super(typeof error.message === "string" ? error.message : `Sandfish returned HTTP ${response.status}`);
    this.name = "SandfishError";
    this.status = response.status;
    this.code = typeof error.code === "string" ? error.code : "http_error";
    this.requestId = typeof error.request_id === "string"
      ? error.request_id : response.headers.get("X-Request-ID") ?? undefined;
    this.details = error.details;
    this.retryAfter = response.headers.get("Retry-After") ?? undefined;
  }
}

export class OperationError extends Error {
  constructor(readonly operation: OperationOut) {
    super(`Operation ${operation.id} ${operation.status}`);
    this.name = "OperationError";
  }
}

async function check(response: Response): Promise<Response> {
  if (response.ok) return response;
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  throw new SandfishError(response, body);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("Retry-After");
  if (value !== null) {
    const numeric = Number(value);
    const ms = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(value) - Date.now();
    if (Number.isFinite(ms) && ms >= 0) return ms;
  }
  return Math.min(2 ** attempt * 1000, 30_000);
}

export class Sandfish {
  readonly actors: ActorsApi;
  readonly analyses: AnalysesApi;
  readonly analysisGroups: AnalysisGroupsApi;
  readonly behaviorEvents: BehaviorEventsApi;
  readonly brands: BrandsApi;
  readonly emailAnalyses: EmailAnalysesApi;
  readonly executionProfiles: ExecutionProfilesApi;
  readonly favicons: FaviconsApi;
  readonly identifiers: IdentifiersApi;
  readonly infrastructure: InfrastructureApi;
  readonly interactions: InteractionsApi;
  readonly javascriptFunctions: JavascriptFunctionsApi;
  readonly operations: OperationsApi;
  readonly payloads: PayloadsApi;
  readonly phishingKits: PhishingKitsApi;
  readonly requests: RequestsApi;
  readonly rules: RulesApi;
  readonly search: SearchApi;
  readonly signals: SignalsApi;
  readonly stats: StatsApi;
  readonly tlsCertificates: TlsCertificatesApi;
  readonly usage: UsageApi;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchRequest: (url: string, init: RequestInit) => Promise<Response>;

  constructor(options: SandfishOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://sandfi.sh").replace(/\/+$/, "");
    const url = new URL(this.baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.pathname.endsWith("/api")) {
      throw new Error("baseUrl must be an HTTP server URL without /api, query, or fragment");
    }
    const timeout = options.timeoutMs ?? 30_000;
    const maxRetries = options.maxRetries ?? 2;
    if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error("timeoutMs must be positive and maxRetries must be a nonnegative integer");
    }
    this.apiKey = options.apiKey;
    const fetch = options.fetch ?? globalThis.fetch;
    this.fetchRequest = async (url, init) => {
      const deadline = AbortSignal.timeout(timeout);
      const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
      for (let attempt = 0; ; attempt++) {
        const response = await fetch(url, { ...init, signal });
        if (!["GET", "HEAD"].includes(init.method ?? "GET")
            || ![429, 502, 503, 504].includes(response.status) || attempt >= maxRetries) return response;
        const ms = retryDelay(response, attempt);
        await response.body?.cancel();
        await delay(ms, signal);
      }
    };
    const config = new Configuration({
      basePath: this.baseUrl,
      accessToken: options.apiKey,
      fetchApi: this.fetchRequest,
      middleware: [{ post: async ({ response }) => check(response) }],
    });
    this.actors = new ActorsApi(config);
    this.analyses = new AnalysesApi(config);
    this.analysisGroups = new AnalysisGroupsApi(config);
    this.behaviorEvents = new BehaviorEventsApi(config);
    this.brands = new BrandsApi(config);
    this.emailAnalyses = new EmailAnalysesApi(config);
    this.executionProfiles = new ExecutionProfilesApi(config);
    this.favicons = new FaviconsApi(config);
    this.identifiers = new IdentifiersApi(config);
    this.infrastructure = new InfrastructureApi(config);
    this.interactions = new InteractionsApi(config);
    this.javascriptFunctions = new JavascriptFunctionsApi(config);
    this.operations = new OperationsApi(config);
    this.payloads = new PayloadsApi(config);
    this.phishingKits = new PhishingKitsApi(config);
    this.requests = new RequestsApi(config);
    this.rules = new RulesApi(config);
    this.search = new SearchApi(config);
    this.signals = new SignalsApi(config);
    this.stats = new StatsApi(config);
    this.tlsCertificates = new TlsCertificatesApi(config);
    this.usage = new UsageApi(config);
  }

  async waitForOperation(operationId: string, options: WaitOptions = {}): Promise<OperationOut> {
    const timeout = options.timeoutMs ?? 300_000;
    const interval = options.intervalMs ?? 1000;
    if (timeout <= 0 || interval <= 0) throw new Error("Polling timeout and interval must be positive");
    const deadline = AbortSignal.timeout(timeout);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    for (;;) {
      signal.throwIfAborted();
      const operation = await this.operations.getOperation({ operationId }, { signal });
      if (operation.status === "succeeded") return operation;
      if (operation.status === "failed" || operation.status === "cancelled") throw new OperationError(operation);
      await delay(interval, signal);
    }
  }

  async *iterAnalyses(params: ListAnalysesRequest = {}, signal?: AbortSignal): AsyncGenerator<AnalysisSummary> {
    let offset = params.offset ?? 0;
    for (;;) {
      signal?.throwIfAborted();
      const page = await this.analyses.listAnalyses({ ...params, limit: params.limit ?? 50, offset }, { signal });
      yield* page.items;
      const next = page.offset + page.limit;
      if (!page.items.length || next >= page.total) return;
      if (page.limit <= 0 || next <= offset) throw new Error("The API returned a non-advancing page");
      offset = next;
    }
  }

  async download(apiPath: string, signal?: AbortSignal): Promise<Response> {
    if (!apiPath.startsWith("/api/")) throw new Error("apiPath must start with /api/");
    const headers = this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined;
    return check(await this.fetchRequest(this.baseUrl + apiPath, { method: "GET", headers, signal }));
  }
}
