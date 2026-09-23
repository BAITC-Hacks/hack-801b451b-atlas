import {
  ApproveRunBodySchema, ChangeLinesBodySchema, CreateDatasetResponseSchema,
  CreateRunBodySchema, DatasetInputSchema, ExportQuerySchema, IdSchema,
  ListDatasetsResponseSchema, RunResponseSchema,
} from "@atlas/contracts";
import { ApiError, Transport, type FetchTransport } from "./transport";

export { ApiError };

type DatasetInput = ReturnType<typeof DatasetInputSchema.parse>;
type CreateRunBody = ReturnType<typeof CreateRunBodySchema.parse>;
type ChangeLinesBody = ReturnType<typeof ChangeLinesBodySchema.parse>;
type ApproveRunBody = ReturnType<typeof ApproveRunBodySchema.parse>;
type ExportQuery = { locale: "ru" | "en"; revision: number };

function id(value: string): string { return encodeURIComponent(IdSchema.parse(value)); }

export function createApiClient(send?: FetchTransport) {
  const transport = new Transport(send);
  return {
    listDatasets: (signal?: AbortSignal) => transport.json("GET", "/datasets", ListDatasetsResponseSchema, { signal }),
    importDataset: (input: DatasetInput, signal?: AbortSignal) => transport.json("POST", "/datasets", CreateDatasetResponseSchema, { body: DatasetInputSchema.parse(input), signal, expectedStatus: 201 }),
    createRun: (input: CreateRunBody, signal?: AbortSignal) => transport.json("POST", "/runs", RunResponseSchema, { body: CreateRunBodySchema.parse(input), signal, timeoutMs: 110_000, singleFlightKey: "createRun", expectedStatus: 201 }),
    getRun: (runId: string, signal?: AbortSignal) => transport.json("GET", `/runs/${id(runId)}`, RunResponseSchema, { signal }),
    changeLines: (runId: string, input: ChangeLinesBody, signal?: AbortSignal) => transport.json("PATCH", `/runs/${id(runId)}/lines`, RunResponseSchema, { body: ChangeLinesBodySchema.parse(input), signal, singleFlightKey: `changeLines:${runId}` }),
    approveRun: (runId: string, input: ApproveRunBody, signal?: AbortSignal) => transport.json("POST", `/runs/${id(runId)}/approve`, RunResponseSchema, { body: ApproveRunBodySchema.parse(input), signal, singleFlightKey: `approveRun:${runId}` }),
    exportRun: async (runId: string, query: ExportQuery, signal?: AbortSignal) => {
      const parsed = ExportQuerySchema.parse(query);
      const filename = `order-${IdSchema.parse(runId)}.csv`;
      const bytes = await transport.csv(`/runs/${id(runId)}/export?locale=${parsed.locale}&revision=${parsed.revision}`, { signal, expectedFilename: filename });
      return { bytes, filename, locale: parsed.locale, revision: parsed.revision };
    },
  };
}

export const api = createApiClient();
