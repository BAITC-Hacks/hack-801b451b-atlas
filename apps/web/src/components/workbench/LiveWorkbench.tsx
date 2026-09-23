"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DatasetInputSchema, type DatasetSummary, type Run } from "@atlas/contracts";
import { useLocale, type Locale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

const RUN_KEY = "atlas-run-id";
type Messages = ReturnType<typeof useLocale>["messages"];
type Notice = "imported" | "ready" | "degraded" | "edited" | "approved" | "exported";

function errorText(error: unknown, m: Messages): string {
  if (!(error instanceof ApiError)) return m.errors.validation;
  if (error.code === "DUPLICATE_REQUEST") return m.run.loading;
  if (error.code === "CANCELLED") return m.errors.generic;
  if (error.code === "TIMEOUT" || error.status === 504) return m.errors.timeout;
  if (error.code === "NETWORK_ERROR") return m.errors.network;
  if (error.status === 403) return m.errors.forbidden;
  if (error.status === 409) return m.errors.conflict;
  if (error.status === 422) return m.errors.unprocessable;
  if (error.status === 503) return m.errors.serviceUnavailable;
  if (error.status === 400 || error.status === 413) return m.errors.validation;
  return m.errors.generic;
}

function number(value: number, locale: Locale, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits }).format(value);
}

function warningText(code: Run["warnings"][number]["code"], m: Messages) {
  return ({INSUFFICIENT_HISTORY: m.warnings.insufficientHistory, CAPPED_TREND: m.warnings.cappedTrend,
    STALE_STOCK: m.warnings.staleStock, OVERDUE_INBOUND: m.warnings.overdueInbound,
    ANOMALY_REVIEW: m.warnings.anomalyReview, OPENAI_FAILED: m.warnings.openaiFailed,
    GPU_WORKLOAD_UNAVAILABLE: m.warnings.gpuWorkloadUnavailable, DATA_GAP: m.warnings.dataGap,
    DEMAND_RISK: m.warnings.demandRisk})[code];
}

function traceText(name: Run["ai"]["trace"][number]["name"], m: Messages) {
  return ({inspectDemand: m.evidence.inspectDemand, classifyEvents: m.evidence.classifyEvents,
    calculateOrders: m.evidence.calculateOrders, openai: m.evidence.openai,
    brev_gpu: m.evidence.brevGpu, reviewDecision: m.evidence.reviewDecision})[name];
}

export function LiveWorkbench() {
  const { locale, messages: m, setLocale } = useLocale();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [busy, setBusy] = useState<"load" | "import" | "run" | "edit" | "approve" | "export" | "refresh" | null>("load");
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editReason, setEditReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await api.listDatasets(controller.signal);
        if (!controller.signal.aborted) {
          setDatasets(result.datasets);
          setDatasetId(result.datasets[0]?.id ?? "");
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause);
      } finally {
        if (!controller.signal.aborted) setBusy(null);
      }
      try {
        const id = window.localStorage.getItem(RUN_KEY);
        if (id) {
          const result = await api.getRun(id, controller.signal);
          if (!controller.signal.aborted) {
            setRun(result.run);
            setDatasetId(result.run.datasetId);
            setWarehouseId(result.run.warehouseId);
            setCategoryId(result.run.categoryId ?? "");
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted && cause instanceof ApiError && cause.status !== 404) setError(cause);
      }
    })();
    return () => controller.abort();
    // Loading data and a known run must not rerun when the locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dataset = datasets.find(item => item.id === datasetId) ?? null;
  const supplierGroups = useMemo(() => {
    const groups = new Map<string, Run["lines"]>();
    for (const line of run?.lines ?? []) groups.set(line.supplierId, [...(groups.get(line.supplierId) ?? []), line]);
    return [...groups.values()];
  }, [run]);

  async function importDataset() {
    if (!file || !privacyConfirmed || busy) return;
    setError(null); setNotice(null); setBusy("import");
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid dataset");
      const input = DatasetInputSchema.parse({ ...raw, privacyConfirmed: true });
      const result = await api.importDataset(input);
      setDatasets(current => [result.dataset, ...current.filter(item => item.id !== result.dataset.id)]);
      setDatasetId(result.dataset.id); setWarehouseId(""); setCategoryId("");
      setRun(null); setAcknowledged(false); setConfirmApproval(false);
      try { window.localStorage.removeItem(RUN_KEY); } catch { /* Storage may be blocked. */ }
      setFile(null); setPrivacyConfirmed(false);
      if (fileInput.current) fileInput.current.value = "";
      setNotice("imported");
    } catch (cause) {
      setError(cause);
    } finally { setBusy(null); }
  }

  async function calculate() {
    if (!dataset || !warehouseId || busy) return;
    setError(null); setNotice(null); setBusy("run");
    try {
      const result = await api.createRun({ datasetId: dataset.id, warehouseId, ...(categoryId ? { categoryId } : {}) });
      setRun(result.run);
      setAcknowledged(false); setConfirmApproval(false); setEditingSku(null);
      try { window.localStorage.setItem(RUN_KEY, result.run.id); } catch { /* Run remains visible in this session. */ }
      setNotice(result.run.mode === "degraded" ? "degraded" : "ready");
    } catch (cause) { setError(cause); }
    finally { setBusy(null); }
  }

  function startEdit(line: Run["lines"][number]) {
    setEditingSku(line.sku); setEditQty(String(line.finalQty)); setEditReason(line.overrideReason ?? "");
    setError(null); setNotice(null);
  }

  async function saveEdit() {
    if (!run || !editingSku || busy) return;
    const finalQty = Number(editQty);
    const overrideReason = editReason.trim();
    if (!/^\d+$/.test(editQty) || !Number.isSafeInteger(finalQty) || finalQty > 1_000_000_000 ||
        overrideReason.length < 1 || overrideReason.length > 240) { setError(new Error("invalid edit")); return; }
    setBusy("edit"); setError(null); setNotice(null);
    try {
      const result = await api.changeLines(run.id, {expectedRevision: run.revision,
        changes: [{sku: editingSku, finalQty, overrideReason}]});
      setRun(result.run); setEditingSku(null); setAcknowledged(false); setConfirmApproval(false);
      setNotice("edited");
    } catch (cause) { setError(cause); }
    finally { setBusy(null); }
  }

  async function approve() {
    if (!run || run.status !== "draft" || !confirmApproval || busy) return;
    setBusy("approve"); setError(null); setNotice(null);
    try {
      const result = await api.approveRun(run.id, {expectedRevision: run.revision,
        confirm: true, acknowledgeWarnings: acknowledged});
      setRun(result.run); setNotice("approved"); setEditingSku(null);
    } catch (cause) { setError(cause); }
    finally { setBusy(null); }
  }

  async function refreshRun() {
    if (!run || busy) return;
    setBusy("refresh"); setError(null);
    try { const result = await api.getRun(run.id); setRun(result.run); setEditingSku(null); setAcknowledged(false); setConfirmApproval(false); }
    catch (cause) { setError(cause); }
    finally { setBusy(null); }
  }

  async function download() {
    if (!run || run.status !== "approved" || busy) return;
    setBusy("export"); setError(null); setNotice(null);
    try {
      const result = await api.exportRun(run.id, {locale, revision: run.revision});
      const url = URL.createObjectURL(result.bytes);
      try {
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = result.filename; document.body.appendChild(anchor);
        anchor.click(); anchor.remove();
      } finally { URL.revokeObjectURL(url); }
      setNotice("exported");
    } catch (cause) { setError(cause); }
    finally { setBusy(null); }
  }

  const needsReview = !!run && (run.warnings.length > 0 || run.lines.some(line => line.warnings.length > 0) ||
    run.ai.decision?.disposition === "needs_attention");
  const editingLine = run?.lines.find(line => line.sku === editingSku);

  return <div className="min-h-screen bg-canvas text-ink">
    <header className="border-b border-line bg-white"><div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-6 py-4 xl:px-10">
      <div><strong className="text-base">{m.common.appName}</strong><p className="text-xs text-muted">{m.common.workspace}</p></div>
      <div className="flex items-center gap-2" role="group" aria-label={m.common.locale}><span className="text-xs text-muted">{m.common.locale}</span>{(["ru", "en"] as const).map(choice => <button key={choice} type="button" lang={choice} aria-pressed={locale === choice} onClick={() => setLocale(choice)} className="min-h-9 min-w-10 rounded border border-line px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-pressed:bg-ink aria-pressed:text-white">{m.common[choice]}</button>)}</div>
    </div></header>
    <main className="mx-auto max-w-[1480px] space-y-6 px-6 py-7 xl:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{m.run.title}</p><h1 className="text-2xl font-semibold">{m.orders.title}</h1></div><p className="rounded border border-line bg-white px-3 py-2 text-xs text-muted">{m.approval.localOnly}</p></div>
      {error !== null && <div role="alert" className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><p>{errorText(error, m)}</p>{error instanceof ApiError && error.issues && <ul className="mt-2 list-disc pl-5">{error.issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{m.errors.validation}: {issue.path} ({issue.code})</li>)}</ul>}</div>}
      {notice && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{{imported: m.dataset.importSuccess, ready: m.run.success, degraded: m.run.degraded, edited: m.approval.editSuccess, approved: m.approval.approved, exported: m.orders.exportSuccess}[notice]}</p>}
      <section className="rounded-lg border border-line bg-white" aria-labelledby="dataset-heading">
        <h2 id="dataset-heading" className="border-b border-line px-5 py-4 font-semibold">{m.dataset.title}</h2>
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block text-xs font-semibold text-muted">{m.dataset.select}<select value={datasetId} onChange={event => { setDatasetId(event.target.value); setWarehouseId(""); setCategoryId(""); setRun(null); setEditingSku(null); setAcknowledged(false); setConfirmApproval(false); try { window.localStorage.removeItem(RUN_KEY); } catch { /* Storage may be blocked. */ } }} disabled={busy !== null || datasets.length === 0} className="mt-1.5 h-9 w-full rounded border border-line bg-white px-3 text-sm font-normal text-ink"><option value="">{busy === "load" ? m.common.loading : m.dataset.selectPlaceholder}</option>{datasets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="block text-xs font-semibold text-muted">{m.dataset.warehouse}<select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} disabled={!dataset || busy !== null} className="mt-1.5 h-9 w-full rounded border border-line bg-white px-3 text-sm font-normal text-ink"><option value="">{m.dataset.noWarehouse}</option>{dataset?.warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="block text-xs font-semibold text-muted">{m.dataset.category}<select value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={!dataset || busy !== null} className="mt-1.5 h-9 w-full rounded border border-line bg-white px-3 text-sm font-normal text-ink"><option value="">{m.dataset.allCategories}</option>{dataset?.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <label className="min-w-[220px] flex-1 text-xs font-semibold text-muted">{m.dataset.file}<input ref={fileInput} type="file" accept=".json,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-xs font-normal" /></label>
            <label className="flex max-w-lg items-center gap-2 text-xs text-muted"><input type="checkbox" checked={privacyConfirmed} onChange={event => setPrivacyConfirmed(event.target.checked)} className="accent-accent" />{m.dataset.privacy}</label>
            <Button type="button" variant="outline" disabled={!file || !privacyConfirmed || busy !== null} onClick={() => void importDataset()}>{busy === "import" ? m.common.loading : m.dataset.import}</Button>
            <Button type="button" disabled={!dataset || !warehouseId || busy !== null} onClick={() => void calculate()}>{busy === "run" ? m.run.loading : m.run.start}</Button>
          </div>
        </div>
        <p className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line bg-[#fafbf9] px-5 py-3 text-xs text-muted"><span>{m.common.source}: {dataset ? `${dataset.label} · ${dataset.kind === "synthetic" ? m.dataset.synthetic : m.dataset.imported}` : m.common.unavailable}</span><span>{m.common.asOf}: {dataset?.asOf ?? m.common.unavailable}</span><span>{m.common.status}: {run ? (run.mode === "degraded" ? m.run.degraded : m.run.success) : m.run.empty}</span></p>
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-white" aria-labelledby="orders-heading"><div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4"><h2 id="orders-heading" className="font-semibold">{m.orders.title}</h2><div className="flex gap-2"><Button type="button" disabled={!run || busy !== null} onClick={() => void refreshRun()} variant="outline" size="small">{m.common.retry}</Button><Button type="button" disabled={run?.status !== "approved" || busy !== null} onClick={() => void download()} variant="outline" size="small">{busy === "export" ? m.common.loading : m.orders.export}</Button></div></div>
          {run && <p className="border-b border-line px-5 py-2 text-xs text-muted">{m.run.revision}: {run.revision} · {m.common.asOf}: {run.asOf} · {run.status === "approved" ? m.approval.approved : m.approval.pending}</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left text-sm"><thead className="bg-[#fafbf9] text-xs text-muted"><tr><th className="px-4 py-3">{m.orders.supplier}</th><th className="px-4 py-3">{m.orders.sku}</th><th className="px-4 py-3">{m.orders.product}</th><th className="px-4 py-3">{m.orders.unit}</th><th className="px-4 py-3 text-right">{m.orders.recommended}</th><th className="px-4 py-3 text-right">{m.orders.final}</th><th className="px-4 py-3">{m.orders.urgency}</th><th className="px-4 py-3">{m.approval.edit}</th></tr></thead><tbody>{supplierGroups.flatMap(group => group.map((line, index) => <tr key={line.sku} className="border-t border-line align-top"><td className="px-4 py-3">{index === 0 ? line.supplierName : ""}</td><td className="px-4 py-3 font-mono text-xs">{line.sku}</td><td className="px-4 py-3"><p>{line.name}</p><p className="mt-1 text-xs leading-5 text-muted">{m.orders.rationale}: {number(line.metrics.baseDaily, locale, 2)} × {number(line.metrics.seasonFactor, locale, 2)} × {number(line.metrics.trendFactor, locale, 2)} × {number(1 + line.metrics.plannedGrowthPct / 100, locale, 2)} × {line.metrics.horizonDays} − {line.metrics.stock} − {line.metrics.eligibleInbound}</p></td><td className="px-4 py-3">{line.unit}</td><td className="px-4 py-3 text-right tabular-nums">{number(line.recommendedQty, locale)}</td><td className="px-4 py-3 text-right tabular-nums">{number(line.finalQty, locale)}</td><td className="px-4 py-3">{m.orders[line.urgency]}</td><td className="px-4 py-3"><Button type="button" size="small" variant="outline" disabled={run?.status !== "draft" || busy !== null} onClick={() => startEdit(line)}>{m.approval.edit}</Button></td></tr>))}</tbody></table>
            {(!run || run.lines.length === 0) && <div className="flex min-h-52 flex-col items-center justify-center gap-2 border-t border-line px-6 py-8 text-center"><DatabaseIcon /><p className="font-medium">{run ? m.orders.noRows : m.run.empty}</p><p className="max-w-sm text-sm text-muted">{run ? m.orders.zeroOrder : m.run.emptyHelp}</p></div>}
          </div>
          {editingLine && run?.status === "draft" && <form className="grid gap-3 border-t border-line bg-canvas px-5 py-4 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-end" onSubmit={event => { event.preventDefault(); void saveEdit(); }}>
            <label className="text-xs font-semibold text-muted">{m.orders.final}<input type="number" min="0" max="1000000000" step="1" required value={editQty} onChange={event => setEditQty(event.target.value)} className="mt-1.5 h-9 w-full rounded border border-line bg-white px-3 text-sm text-ink" /></label>
            <label className="text-xs font-semibold text-muted">{m.approval.reason}<input type="text" minLength={1} maxLength={240} required value={editReason} onChange={event => setEditReason(event.target.value)} className="mt-1.5 h-9 w-full rounded border border-line bg-white px-3 text-sm text-ink" /></label>
            <div className="flex gap-2"><Button type="submit" disabled={busy !== null || !editReason.trim()}>{busy === "edit" ? m.common.loading : m.common.save}</Button><Button type="button" variant="outline" disabled={busy !== null} onClick={() => setEditingSku(null)}>{m.common.cancel}</Button></div>
          </form>}
        </section>
        <aside className="rounded-lg border border-line bg-white" aria-labelledby="evidence-heading">
          <h2 id="evidence-heading" className="border-b border-line px-5 py-4 font-semibold">{m.evidence.title}</h2>
          <div className="space-y-4 px-5 py-5">
            <div className="grid grid-cols-2 gap-2">{(["openai", "brev_gpu"] as const).map(name => { const item = run?.ai.runtimes.find(runtime => runtime.runtime === name); return <div key={name} className="rounded border border-line bg-canvas px-3 py-3"><p className="text-xs font-semibold">{name === "openai" ? m.evidence.openai : m.evidence.brevGpu}</p><p className="mt-1 text-xs text-muted">{item ? m.evidence[item.status] : m.common.unavailable}</p>{item?.model && <p className="mt-1 break-all text-xs text-muted">{item.model}</p>}{item?.errorCode && <p className="mt-1 text-xs text-warning">{name === "openai" ? m.errors.openaiUnavailable : item.errorCode === "TIMEOUT" ? m.errors.gpuTimeout : item.errorCode === "GPU_UNVERIFIED" ? m.errors.gpuUnverified : m.errors.gpuUnavailable}</p>}</div>; })}</div>
            {run ? <>
              <p className="break-all text-xs text-muted">{m.evidence.request}: {run.id}</p>
              <div className="border-t border-line pt-4"><h3 className="text-xs font-semibold text-muted">{m.evidence.liveTrace}</h3><ol className="mt-2 space-y-2">{run.ai.trace.map(event => <li key={event.id} className="flex items-start justify-between gap-2 text-xs"><span>{traceText(event.name, m)}</span><span className="text-muted">{m.evidence[event.status]} · {number(event.elapsedMs, locale)} ms</span></li>)}</ol></div>
              {run.ai.eventActions.length > 0 && <div className="border-t border-line pt-4"><h3 className="text-xs font-semibold text-muted">{m.evidence.eventActions}</h3><ul className="mt-2 space-y-1 text-xs">{run.ai.eventActions.map(action => <li key={action.eventId}><span className="font-mono">{action.eventId}</span> · {m.evidence.actions[action.action]}</li>)}</ul></div>}
              {run.ai.gpuEvidence && <p className="border-t border-line pt-4 text-xs text-muted">{m.evidence.gpuEvidence}: {run.ai.gpuEvidence.gpuName} · {run.ai.gpuEvidence.inferenceResponseId}</p>}
              {run.warnings.length > 0 && <div className="border-t border-line pt-4"><h3 className="text-xs font-semibold text-warning">{m.warnings.attention}</h3><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-warning">{run.warnings.map((warning, index) => <li key={`${warning.code}-${warning.sku}-${index}`}>{warningText(warning.code, m)}{warning.sku ? ` · ${warning.sku}` : ""}</li>)}</ul></div>}
            </> : <p className="text-sm text-muted">{m.evidence.awaiting}</p>}
            <div className="border-t border-line pt-4"><h3 className="text-xs font-semibold text-muted">{m.approval.title}</h3>
              <p className="mt-2 text-sm">{run?.status === "approved" ? m.approval.approved : m.approval.pending}</p>
              {run?.status === "draft" && <>
                {needsReview && <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-0.5 accent-accent" />{m.approval.acknowledge}</label>}
                <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmApproval} onChange={event => setConfirmApproval(event.target.checked)} className="mt-0.5 accent-accent" />{m.approval.confirmation} {run.revision}</label>
                <Button type="button" disabled={busy !== null || !confirmApproval || (needsReview && !acknowledged)} onClick={() => void approve()} className="mt-4 w-full">{busy === "approve" ? m.common.loading : m.approval.approve}</Button>
              </>}
              {run?.status === "approved" && <p className="mt-2 text-xs text-muted">{run.approvedBy} · {run.approvedAt}</p>}
            </div>
          </div>
        </aside>
      </div>
    </main>
  </div>;
}

function DatabaseIcon() { return <span aria-hidden="true" className="text-2xl text-muted">□</span>; }
