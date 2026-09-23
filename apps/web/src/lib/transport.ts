import { ErrorSchema, type ErrorCode } from "@atlas/contracts";

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

export type FetchTransport = typeof fetch;
type ValidationIssues = ReturnType<typeof ErrorSchema.parse>["error"]["issues"];

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | "INVALID_RESPONSE" | "NETWORK_ERROR" | "TIMEOUT" | "CANCELLED" | "DUPLICATE_REQUEST",
    public readonly requestId: string | null = null,
    public readonly issues?: ValidationIssues,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const API_ROOT = "/api/v1";
const RUN_TIMEOUT_MS = 110_000;

export class Transport {
  private readonly pending = new Set<string>();

  constructor(private readonly send: FetchTransport = fetch) {}

  async json<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    schema: Schema<T>,
    options: { body?: unknown; signal?: AbortSignal; timeoutMs?: number; singleFlightKey?: string; expectedStatus?: 200 | 201 } = {},
  ): Promise<T> {
    return this.execute(method, path, schema, options) as Promise<T>;
  }

  async csv(path: string, options: { signal?: AbortSignal; expectedFilename: string }): Promise<Blob> {
    return this.execute("GET", path, null, options) as Promise<Blob>;
  }

  private async execute<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    schema: Schema<T> | null,
    options: { body?: unknown; signal?: AbortSignal; timeoutMs?: number; singleFlightKey?: string; expectedFilename?: string; expectedStatus?: 200 | 201 },
  ): Promise<T | Blob> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) throw new ApiError(0, "INVALID_RESPONSE");
    const key = options.singleFlightKey;
    if (key && this.pending.has(key)) throw new ApiError(0, "DUPLICATE_REQUEST");
    if (key) this.pending.add(key);
    const controller = new AbortController();
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    const timer = setTimeout(() => controller.abort("timeout"), options.timeoutMs ?? RUN_TIMEOUT_MS);
    try {
      const response = await this.send(`${API_ROOT}${path}`, {
        method,
        headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        let payload: unknown;
        try { payload = await response.json(); } catch { throw new ApiError(response.status, "INVALID_RESPONSE"); }
        const parsed = ErrorSchema.safeParse(payload);
        if (!parsed.success) throw new ApiError(response.status, "INVALID_RESPONSE");
        throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.requestId, parsed.data.error.issues);
      }
      if (response.status !== (options.expectedStatus ?? 200)) throw new ApiError(response.status, "INVALID_RESPONSE");
      if (schema === null) {
        if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/csv")) throw new ApiError(response.status, "INVALID_RESPONSE");
        const disposition = response.headers.get("content-disposition");
        const attachment = disposition?.match(/^attachment;\s*filename=(?:"([^"]+)"|([^;\s]+))$/i);
        if (options.expectedFilename && (attachment?.[1] ?? attachment?.[2]) !== options.expectedFilename) throw new ApiError(response.status, "INVALID_RESPONSE");
        return await response.blob();
      }
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new ApiError(response.status, "INVALID_RESPONSE"); }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new ApiError(response.status, "INVALID_RESPONSE");
      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError(0, options.signal?.aborted ? "CANCELLED" : "TIMEOUT");
      throw new ApiError(0, "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (key) this.pending.delete(key);
    }
  }
}
