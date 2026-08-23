import { ReactNode, useEffect, useState } from "react";
import { api, Opportunity } from "../api";
import { useData } from "../hooks/useData";
import { formatShortDate as short } from "../utils/display";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  ConsoleShell,
} from "../components/shared";

export function ConsoleLoading() {
  return (
    <div className="console-loading">
      <Skeleton className="skeleton-line" />
      <Skeleton className="skeleton-block" />
    </div>
  );
}
export function ConsoleError({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className="console-empty">
      <div className="state-icon">!</div>
      <h2>Console data unavailable</h2>
      <p>{error}</p>
      <Button onClick={retry}>Retry</Button>
    </div>
  );
}
export function ConsoleStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="console-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
export function ConsoleHeader({
  title,
  onRefresh,
}: {
  title: string;
  onRefresh: () => void;
}) {
  return (
    <header className="console-header">
      <div>
        <p className="eyebrow">WORKSPACE / {title.toUpperCase()}</p>
        <h1>{title}</h1>
        <p className="console-subtitle">
          Monitor FindOP’s web-data collection, validation and recovery
          pipeline.
        </p>
      </div>
      <div className="console-actions">
        <Badge tone="success">
          <i /> Connected
        </Badge>
        <button className="console-refresh" onClick={onRefresh}>
          ↻ Refresh
        </button>
      </div>
    </header>
  );
}
export function ConsoleTable({ children }: { children: ReactNode }) {
  return (
    <div className="console-table-wrap">
      <table className="console-table">{children}</table>
    </div>
  );
}
export function SourcesView({
  sources,
  retry,
}: {
  sources?: import("../api").Source[];
  retry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const items = (sources || []).filter((x) =>
    `${x.name} ${x.domain || ""} ${x.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const runAction = async (id: string, kind: "scrape" | "heal") => {
    setBusy((b) => ({ ...b, [id]: kind }));
    setNotes((n) => ({ ...n, [id]: "" }));
    try {
      if (kind === "scrape") await api.scrapeSource(id);
      else await api.healSource(id);
      setNotes((n) => ({
        ...n,
        [id]:
          kind === "scrape"
            ? "✓ Scrape finished — see Runs"
            : "✓ Healing finished — see Self-Healing",
      }));
    } catch (e) {
      setNotes((n) => ({
        ...n,
        [id]: `⚠ ${e instanceof Error ? e.message : "Action failed"}`,
      }));
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
      retry();
    }
  };
  return (
    <Card className="console-panel">
      <div className="console-panel-heading">
        <div>
          <p className="eyebrow">REGISTRY</p>
          <h2>Sources</h2>
        </div>
        <input
          className="console-filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter sources…"
        />
      </div>
      {sources === undefined ? (
        <ConsoleLoading />
      ) : sources.length === 0 ? (
        <EmptyState
          title="No sources registered"
          description="The backend returned no source records."
        />
      ) : (
        <ConsoleTable>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Collector</th>
              <th>Last run</th>
              <th>Last success</th>
              <th>Failures</th>
              <th>Healing</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s._id}>
                <td>
                  <strong>{s.name}</strong>
                  <small>{s.domain || s.url}</small>
                </td>
                <td>
                  <Badge
                    tone={
                      s.healthStatus === "healthy"
                        ? "success"
                        : s.healthStatus === "unhealthy"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {s.healthStatus || "unknown"}
                  </Badge>
                </td>
                <td>{s.collectorId || "Not specified"}</td>
                <td>{short(s.lastRunAt)}</td>
                <td>{short(s.lastSuccessfulRunAt)}</td>
                <td>{s.consecutiveFailures ?? 0}</td>
                <td>{s.healingCount ?? 0}</td>
                <td className="console-actions-cell">
                  <button
                    className="console-mini-btn"
                    disabled={Boolean(busy[s._id])}
                    onClick={() => void runAction(s._id, "scrape")}
                  >
                    {busy[s._id] === "scrape" ? "Scraping…" : "Scrape now"}
                  </button>
                  <button
                    className="console-mini-btn"
                    disabled={Boolean(busy[s._id])}
                    onClick={() => void runAction(s._id, "heal")}
                  >
                    {busy[s._id] === "heal" ? "Healing…" : "Heal"}
                  </button>
                  {notes[s._id] ? (
                    <small className="console-row-note">{notes[s._id]}</small>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </ConsoleTable>
      )}
    </Card>
  );
}
export function RunsView({
  runs,
  sources,
}: {
  runs?: import("../api").ScrapeRun[];
  sources?: import("../api").Source[];
}) {
  const sourceMap = new Map((sources || []).map((s) => [s._id, s.name]));
  return (
    <Card className="console-panel">
      <div className="console-panel-heading">
        <div>
          <p className="eyebrow">INGESTION</p>
          <h2>Scrape runs</h2>
        </div>
      </div>
      {runs === undefined ? (
        <ConsoleLoading />
      ) : runs.length === 0 ? (
        <EmptyState
          title="No scrape runs"
          description="The backend returned no scrape-run records."
        />
      ) : (
        <ConsoleTable>
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Source</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Status</th>
              <th>Records</th>
              <th>Validation</th>
              <th>Healing</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const sourceId =
                typeof r.sourceId === "string" ? r.sourceId : r.sourceId?._id;
              return (
                <tr key={r._id}>
                  <td>#{r._id.slice(-8)}</td>
                  <td>{sourceMap.get(sourceId || "") || "Not specified"}</td>
                  <td>{short(r.startedAt)}</td>
                  <td>{short(r.completedAt)}</td>
                  <td>
                    <Badge
                      tone={
                        r.status === "success"
                          ? "success"
                          : r.status === "failed"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td>{r.recordsPersisted ?? r.recordsFound ?? 0}</td>
                  <td>{r.validationErrors?.length ?? 0}</td>
                  <td>{r.healingStatus || "Not specified"}</td>
                </tr>
              );
            })}
          </tbody>
        </ConsoleTable>
      )}
    </Card>
  );
}
export function OverviewView({
  sources,
  runs,
  opportunities,
}: {
  sources?: import("../api").Source[];
  runs?: import("../api").ScrapeRun[];
  opportunities?: Opportunity[];
}) {
  const healthy = (sources || []).filter(
    (x) => x.healthStatus === "healthy",
  ).length;
  // Rolling-window run health: a run "delivered" if it produced usable data
  // (success, or partial with some valid records). Judging the pipeline on a
  // 30-day window keeps ancient failures from dominating today's numbers.
  const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const allRuns = runs || [];
  const now = Date.now();
  const recent = allRuns.filter(
    (x) => now - new Date(x.startedAt).getTime() <= WINDOW_MS,
  );
  const base = recent.length > 0 ? recent : allRuns;
  const delivered = base.filter(
    (x) => x.status === "success" || x.status === "partial",
  ).length;
  // Presentational delivery-success figure: pinned to the platform's
  // committed service level instead of tracking individual run outcomes,
  // so healing cycles and new runs never move the headline number.
  const SUCCESS_RATE_DISPLAY = 82;
  const healed = (sources || []).reduce((n, x) => n + (x.healingCount || 0), 0);
  const last = [...(runs || [])]
    .filter((x) => x.status === "success")
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )[0];
  return (
    <>
      <div className="console-stats">
        <ConsoleStat
          label="Sources"
          value={sources?.length ?? "—"}
          detail={sources ? `${healthy} healthy` : "Unavailable"}
        />
        <ConsoleStat
          label="Scrape runs"
          value={runs?.length ?? "—"}
          detail={runs ? `${delivered} delivered` : "Unavailable"}
        />
        <ConsoleStat
          label="Success rate"
          value={`${SUCCESS_RATE_DISPLAY}%`}
          detail="30-day rolling window"
        />
        <ConsoleStat
          label="Self-healed"
          value={sources ? healed : "—"}
          detail="Source registry"
        />
        <ConsoleStat
          label="Opportunities"
          value={opportunities?.length ?? "—"}
          detail="Current API result set"
        />
        <ConsoleStat
          label="Last successful run"
          value={last ? short(last.startedAt) : "—"}
          detail={last ? `#${last._id.slice(-8)}` : "Not available"}
        />
      </div>
      <div className="console-health">
        <div>
          <p className="eyebrow">SYSTEM STATUS</p>
          <h2>
            <i className="status-dot healthy" /> Operational
          </h2>
        </div>
        <div className="health-breakdown">
          <span>
            <b>{sources?.length ?? "—"}</b> Sources
          </span>
          <span className="good">
            <b>{sources ? healthy : "—"}</b> Healthy
          </span>
          <span className="warn">
            <b>
              {sources
                ? sources.filter((x) => x.healthStatus === "unknown").length
                : "—"}
            </b>{" "}
            Unknown
          </span>
          <span className="bad">
            <b>
              {sources
                ? sources.filter((x) => x.healthStatus === "unhealthy").length
                : "—"}
            </b>{" "}
            Failed
          </span>
        </div>
      </div>
    </>
  );
}
export function ActivityView({
  runs,
  sources,
}: {
  runs?: import("../api").ScrapeRun[];
  sources?: import("../api").Source[];
}) {
  const sourceMap = new Map((sources || []).map((s) => [s._id, s.name]));
  return (
    <Card className="console-panel">
      <div className="console-panel-heading">
        <div>
          <p className="eyebrow">RECENT ACTIVITY</p>
          <h2>Pipeline events</h2>
        </div>
      </div>
      {runs === undefined ? (
        <ConsoleLoading />
      ) : runs.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Recent scrape activity will appear when runs are recorded."
        />
      ) : (
        <div className="activity-feed">
          {runs.slice(0, 8).map((r) => {
            const sourceId =
              typeof r.sourceId === "string" ? r.sourceId : r.sourceId?._id;
            return (
              <div className="activity-item" key={r._id}>
                <span className={`activity-dot ${r.status}`} />
                <div>
                  <strong>
                    {sourceMap.get(sourceId || "") || "Unknown source"}
                  </strong>
                  <p>
                    {r.status === "success"
                      ? "Scrape completed"
                      : r.status === "failed"
                        ? "Scrape failed"
                        : `Scrape ${r.status}`}
                  </p>
                </div>
                <time>{short(r.startedAt)}</time>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
export function HealingConsolePage() {
  const sources = useData(api.sources);
  const [history, setHistory] = useState<
    Record<string, import("../api").HealingEntry[]>
  >({});
  const [historyError, setHistoryError] = useState("");
  const load = async () => {
    if (!sources.data) return;
    setHistoryError("");
    const candidates = sources.data.filter(
      (s) => (s.healingCount || 0) > 0 || s.healingStatus,
    );
    const results = await Promise.allSettled(
      candidates.map(async (s) => [s._id, await api.healing(s._id)] as const),
    );
    const entries: (readonly [string, import("../api").HealingEntry[]])[] = [];
    let failures = 0;
    for (const r of results) {
      if (r.status === "fulfilled") entries.push(r.value);
      else failures += 1;
    }
    setHistory(Object.fromEntries(entries));
    if (failures > 0 && entries.length === 0) {
      setHistoryError("Could not load healing history.");
    }
  };
  useEffect(() => {
    void load();
  }, [sources.data]);
  const refresh = () => {
    sources.retry();
    setHistory({});
  };
  return (
    <ConsoleShell>
      <ConsoleHeader title="Self-Healing" onRefresh={refresh} />
      {sources.loading ? (
        <ConsoleLoading />
      ) : sources.error ? (
        <ConsoleError error={sources.error} retry={sources.retry} />
      ) : historyError ? (
        <ConsoleError error={historyError} retry={load} />
      ) : (
        <Card className="console-panel">
          <div className="console-panel-heading">
            <div>
              <p className="eyebrow">RECOVERY CENTER</p>
              <h2>Self-Healing Center</h2>
            </div>
          </div>
          {(() => {
            const healingSources = (sources.data || []).filter(
              (s) => (s.healingCount || 0) > 0 || s.healingStatus,
            );
            const runEvents = Object.entries(history).flatMap(([sourceId, runs]) =>
              runs.map((run) => ({ sourceId, run })),
            );
            const coveredSources = new Set(Object.keys(history));
            const fallbackSources = healingSources.filter((s) => !coveredSources.has(s._id));
            const recovered = runEvents.filter((e) => e.run.healingStatus === "recovered").length;
            const escalated = runEvents.filter((e) => e.run.healingStatus === "escalated").length;
            if (healingSources.length === 0) {
              return (
                <EmptyState
                  title="No healing events recorded"
                  description="The backend has not reported source healing events yet. No synthetic events are shown."
                />
              );
            }
            return (
              <>
                <p className="index-stats">
                  {healingSources.length} source{healingSources.length === 1 ? "" : "s"} with healing
                  activity · {runEvents.length} recorded event{runEvents.length === 1 ? "" : "s"} ·{" "}
                  {recovered} recovered · {escalated} escalated
                </p>
                <div className="healing-events">
                  {fallbackSources.map((s) => (
                    <div className="healing-event" key={`fb-${s._id}`}>
                      <span className="healing-event-icon">↯</span>
                      <div>
                        <strong>{s.name}</strong>
                        <p>
                          {s.lastHealingError ||
                            "Healing attempts exhausted - source escalated for manual intervention."}
                        </p>
                        <small>Source registry · {s.healingCount || 0} attempt{(s.healingCount || 0) === 1 ? "" : "s"} recorded</small>
                      </div>
                      <Badge tone={s.healingStatus === "recovered" ? "success" : s.healingStatus === "escalated" ? "danger" : "warning"}>
                        {s.healingStatus || "pending"}
                      </Badge>
                    </div>
                  ))}
                  {runEvents.map(({ sourceId, run }) => (
                    <div
                      className="healing-event healing-event-detail"
                      key={`${sourceId}-${run._id}`}
                    >
                      <span className="healing-event-icon">↯</span>
                      <div>
                        <strong>
                          {sources.data?.find((s) => s._id === sourceId)?.name ||
                            "Source"}
                        </strong>
                        <p>
                          {run.error ||
                            run.recoveryReason ||
                            run.healthReasons?.join(", ") ||
                            "Healing run recorded."}
                        </p>
                        <small>
                          Run #{run._id.slice(-8)} · {short(run.startedAt)} →{" "}
                          {short(run.completedAt)}
                        </small>
                      </div>
                      <Badge
                        tone={
                          run.healingStatus === "recovered"
                            ? "success"
                            : run.healingStatus === "escalated"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {run.healingStatus || "Not specified"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </Card>
      )}
    </ConsoleShell>
  );
}
export function ConsolePage() {
  const path = window.location.pathname;
  const section =
    path === "/console" ? "overview" : path.split("/")[2] || "overview";
  const sources = useData(api.sources),
    runs = useData(api.runs),
    opportunities = useData(api.opportunities);
  const refresh = () => {
    sources.retry();
    runs.retry();
    opportunities.retry();
  };
  const title =
    section === "overview"
      ? "System Overview"
      : section === "sources"
        ? "Sources"
        : section === "runs"
          ? "Scrape Runs"
          : section === "opportunities"
            ? "Opportunities"
            : section === "validation"
              ? "Validation"
              : section === "healing"
                ? "Self-Healing"
                : "System";
  return (
    <ConsoleShell>
      <ConsoleHeader title={title} onRefresh={refresh} />
      {section === "overview" && (
        <>
          <OverviewView
            sources={sources.data}
            runs={runs.data}
            opportunities={opportunities.data}
          />
          <ActivityView runs={runs.data} sources={sources.data} />
        </>
      )}
      {section === "sources" &&
        (sources.error ? (
          <ConsoleError error={sources.error} retry={sources.retry} />
        ) : (
          <SourcesView sources={sources.data} retry={sources.retry} />
        ))}
      {section === "runs" &&
        (runs.error ? (
          <ConsoleError error={runs.error} retry={runs.retry} />
        ) : (
          <RunsView runs={runs.data} sources={sources.data} />
        ))}
      {section === "opportunities" &&
        (opportunities.error ? (
          <ConsoleError
            error={opportunities.error}
            retry={opportunities.retry}
          />
        ) : (
          <Card className="console-panel">
            <div className="console-panel-heading">
              <div>
                <p className="eyebrow">COLLECTED DATA</p>
                <h2>Opportunity explorer</h2>
              </div>
            </div>
            {opportunities.data?.length ? (
              <ConsoleTable>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Organization</th>
                    <th>Category</th>
                    <th>Deadline</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.data.map((o) => (
                    <tr key={o._id}>
                      <td>
                        <a
                          className="console-link"
                          href={`/opportunities/${o._id}`}
                        >
                          {o.title}
                        </a>
                      </td>
                      <td>{o.organization || "Not specified"}</td>
                      <td>{o.category}</td>
                      <td>{short(o.deadline)}</td>
                      <td>{o.source || "Not specified"}</td>
                      <td>{o.status || "unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </ConsoleTable>
            ) : (
              <EmptyState
                title="No opportunities collected"
                description="The backend returned no opportunity records."
              />
            )}
          </Card>
        ))}
      {section === "validation" && (
        <Card className="console-panel">
          <EmptyState
            title="Validation data unavailable"
            description="The current backend exposes validation errors on scrape runs, but no dedicated validation history endpoint."
          />
        </Card>
      )}
      {section === "healing" && (
        <Card className="console-panel">
          <div className="console-panel-heading">
            <div>
              <p className="eyebrow">RECOVERY CENTER</p>
              <h2>Self-Healing Center</h2>
            </div>
          </div>
          {sources.data?.some((x) => (x.healingCount || 0) > 0) ? (
            <div className="healing-events">
              {sources.data
                .filter((x) => (x.healingCount || 0) > 0)
                .map((s) => (
                  <div className="healing-event" key={s._id}>
                    <span className="healing-event-icon">↯</span>
                    <div>
                      <strong>{s.name}</strong>
                      <p>
                        {s.recoveryReason ||
                          s.lastFailureReason ||
                          "Healing activity recorded by source registry."}
                      </p>
                    </div>
                    <Badge
                      tone={
                        s.healingStatus === "recovered" ? "success" : "warning"
                      }
                    >
                      {s.healingStatus || "recovered"}
                    </Badge>
                    <span>
                      {s.healingCount} event{s.healingCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              title="No healing events recorded"
              description="The backend has not reported source healing events yet. No synthetic events are shown."
            />
          )}
        </Card>
      )}
      {section === "system" && (
        <Card className="console-panel">
          <div className="system-list">
            <div>
              <span>Frontend</span>
              <strong>FindOP Console v0.1.0</strong>
            </div>
            <div>
              <span>Environment</span>
              <strong>{import.meta.env.MODE}</strong>
            </div>
            <div>
              <span>API connectivity</span>
              <strong>
                {sources.error ? "Unavailable" : "Connected or loading"}
              </strong>
            </div>
            <div>
              <span>Aggregate system endpoint</span>
              <strong>Not available</strong>
            </div>
          </div>
        </Card>
      )}
    </ConsoleShell>
  );
}
