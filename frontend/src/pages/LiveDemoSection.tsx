import { useCallback, useEffect, useRef, useState } from "react";

import { api, type DemoRunStatus, type DemoScraper, type DemoState } from "../api";
import { UserShell } from "../components/shared";

const CATEGORIES = [
  "hackathon",
  "internship",
  "fellowship",
  "scholarship",
  "grant",
  "competition",
  "job",
  "program",
] as const;

const IN_FLIGHT: DemoRunStatus[] = ["queued", "discovering", "extracting", "healing"];

const VERDICT_BANNER: Record<string, { className: string; label: string }> = {
  healthy: { className: "healthy", label: "HEALTHY — data matches the configuration" },
  broken: { className: "broken", label: "BROKEN — content contradicts the configuration" },
  healing: { className: "healing", label: "HEALING — re-discovering and repairing…" },
  recovered: { className: "recovered", label: "RECOVERED — the scraper healed itself" },
  escalated: { className: "escalated", label: "ESCALATED — automatic repair could not verify" },
  failed: { className: "escalated", label: "NO USABLE DATA THIS RUN — try another site or category" },
};

function formatTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString();
}

export function LiveDemoSection() {
  const [state, setState] = useState<DemoState | null>(null);
  const [scrapers, setScrapers] = useState<DemoScraper[]>([]);
  const [urlDraft, setUrlDraft] = useState("https://wemakedevs.org");
  const [category, setCategory] = useState<string>("hackathon");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"scrape" | "break" | "heal" | "reset" | "promote" | null>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextRun, nextScrapers] = await Promise.all([api.demoState(), api.demoScrapers()]);
      setState(nextRun);
      setScrapers(nextScrapers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the backend.");
    }
  }, []);

  useEffect(() => {
    // Every visit starts from a clean sandbox: wipe previous runs so the
    // demo always opens fast, fresh and free of the last visitor's data.
    let cancelled = false;
    (async () => {
      try {
        const [freshRun, nextScrapers] = await Promise.all([api.demoReset(), api.demoScrapers()]);
        if (cancelled) return;
        setState(freshRun);
        setScrapers(nextScrapers);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach the backend.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // While a run is in flight, poll state so visitors watch it happen live.
  useEffect(() => {
    if (state && IN_FLIGHT.includes(state.status)) {
      pollRef.current = window.setTimeout(() => void refresh(), 2000);
      return () => {
        if (pollRef.current) window.clearTimeout(pollRef.current);
      };
    }
    return undefined;
  }, [state, refresh]);

  const act = async (kind: Exclude<typeof busy, null>, action: () => Promise<unknown>, doneMessage?: string) => {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      if (doneMessage) setNotice(doneMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const status = state?.status ?? "healthy";
  const inFlight = IN_FLIGHT.includes(status);
  const canBreak = status === "healthy" && (state?.records.length ?? 0) > 0 && !inFlight;
  const canHeal = (status === "broken" || status === "escalated") && !inFlight;

  const pipelineStage = (() => {
    switch (status) {
      case "queued": return 0;
      case "discovering": return 1;
      case "extracting":
      case "healing": return 2;
      default: return status === "failed" ? -1 : 3;
    }
  })();
  const stages = ["Discover", "Extract", "Classify", "Verify"];
  const extractProgress =
    status === "extracting" || (status === "healing" && state?.progress?.total)
      ? `${state?.progress?.done ?? 0}/${state?.progress?.total ?? "?"}`
      : null;

  return (
    <section className="live-demo-section" id="live-demo">
      <div className="section-heading live-demo-heading">
        <div>
          <p className="eyebrow">LIVE SANDBOX · REAL BRIGHT DATA PIPELINE</p>
          <h2>Try FindOP right now.</h2>
          <p className="live-demo-sub">
            Paste any website — we discover its opportunities through real search +
            extraction pipelines, classify every record, then show you the results
            live. Break the scraper on purpose and watch it heal itself.
          </p>
        </div>
        <span className={`demo-status ${VERDICT_BANNER[status]?.className ?? ""}`}>
          {inFlight ? status.toUpperCase() + "…" : VERDICT_BANNER[status]?.label ?? status.toUpperCase()}
        </span>
      </div>

      <div className="live-demo-shell">
        <div className="live-demo-controls">
          <input
            className="foundation-input live-demo-url"
            value={urlDraft}
            spellCheck={false}
            placeholder="any website — e.g. wemakedevs.org"
            disabled={inFlight}
            onChange={(e) => setUrlDraft(e.target.value)}
          />
          <select
            className="foundation-input live-demo-category"
            value={category}
            disabled={inFlight}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button
            className="button primary live-demo-scrape"
            disabled={inFlight || busy !== null}
            onClick={() =>
              void act("scrape", () =>
                api.demoScrape({
                  url: urlDraft.trim(),
                  category,
                }),
              )
            }
          >
            {inFlight ? "Running…" : busy === "scrape" ? "Starting…" : "Scrape this site →"}
          </button>
        </div>

        <ol className={`live-demo-pipeline ${inFlight ? "running" : ""}`}>
          {stages.map((stage, index) => (
            <li
              key={stage}
              className={
                index === pipelineStage ? "active" : index < pipelineStage ? "done" : ""
              }
            >
              <span>{stage}</span>
              {stage === "Extract" && extractProgress ? <em>{extractProgress}</em> : null}
            </li>
          ))}
        </ol>

        {error ? <p className="demo-error">{error}</p> : null}
        {notice ? <p className="demo-notice">{notice}</p> : null}

        {state ? (
          <>
            <dl className="demo-meta">
              <div>
                <dt>Site</dt>
                <dd>{state.config.domain || new URL(state.config.url).hostname}</dd>
              </div>
              <div>
                <dt>Pages discovered</dt>
                <dd>{state.discoveredUrls.length}</dd>
              </div>
              <div>
                <dt>Valid records</dt>
                <dd>{state.stats.valid}</dd>
              </div>
              <div>
                <dt>Last run</dt>
                <dd>{formatTime(state.scrapedAt)}</dd>
              </div>
            </dl>

            <div className="live-demo-actions">
              {canBreak ? (
                <button
                  className="button danger"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(
                      "break",
                      async () => {
                        await api.demoBreak();
                        await api.demoScrape();
                      },
                      "We broke the scraper on purpose. Press Heal to repair it.",
                    )
                  }
                >
                  ⚡ Break the scraper
                </button>
              ) : null}
              {canHeal ? (
                <button
                  className="button primary"
                  disabled={busy !== null}
                  onClick={() => void act("heal", () => api.demoHeal())}
                >
                  Heal scraper
                </button>
              ) : null}
              <button
                className="button ghost"
                disabled={inFlight || busy !== null}
                onClick={() => void act("reset", () => api.demoReset(), "Sandbox reset.")}
              >
                Reset sandbox
              </button>
            </div>

            {canHeal && state.records.length > 0 ? (
              <p className="live-demo-hint">
                The configured category no longer matches the content signals in{" "}
                {state.stats.valid} record{state.stats.valid === 1 ? "" : "s"} above. Heal
                re-runs discovery + extraction and corrects the config automatically.
              </p>
            ) : null}

            {state.healingTimeline.length > 0 ? (
              <ol className="demo-timeline">
                {state.healingTimeline.slice(-6).map((entry, index) => (
                  <li key={`${entry.step}-${index}`} className={`demo-step step-${entry.step}`}>
                    <span className="step-name">{entry.step.replace(/_/g, " ")}</span>
                    <span className="step-detail">{entry.detail}</span>
                    <time>{formatTime(entry.at)}</time>
                  </li>
                ))}
              </ol>
            ) : null}

            {state.records.length > 0 ? (
              <div className="demo-cards">
                {state.records.map((record) => (
                  <article key={record.url} className="demo-card">
                    <header>
                      <strong>{record.title}</strong>
                      <span className={`demo-chip chip-${record.category}`}>{record.category}</span>
                    </header>
                    {record.organization ? <p className="card-org">{record.organization}</p> : null}
                    {record.description ? <p className="card-desc">{record.description}</p> : null}
                    <footer>
                      {record.signalCategory && record.signalCategory !== record.category ? (
                        <em className="signal-note">signals say: {record.signalCategory}</em>
                      ) : (
                        <span className="card-meta">
                          {[record.location, record.mode].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <a href={record.url} target="_blank" rel="noreferrer">open ↗</a>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              !inFlight ? (
                <p className="live-demo-hint">
                  Enter a website above and press <strong>Scrape this site</strong>. Every run
                  hits Bright Data fresh — nothing is pre-cached.
                </p>
              ) : null
            )}

            {scrapers.length > 0 ? (
              <div className="live-demo-scrapers">
                <h3>Saved scrapers <small>(stored in our database)</small></h3>
                <ul>
                  {scrapers.map((scraper) => (
                    <li key={scraper._id}>
                      <code>{scraper.domain}</code>
                      <span className="scraper-cat">{scraper.category}</span>
                      <span className="scraper-runs">{scraper.runCount} runs</span>
                      {scraper.promotedSourceId ? (
                        <em className="scraper-promoted">✓ In Sources</em>
                      ) : (
                        <button
                          className="text-link"
                          disabled={busy !== null}
                          onClick={() => void act("promote", () => api.demoPromote(scraper._id), "Added to your Sources registry.")}
                        >
                          Add to Sources →
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="live-demo-hint">Loading sandbox…</p>
        )}
      </div>
    </section>
  );
}

export function LiveDemoPage() {
  return (
    <UserShell>
      <main className="landing">
        <LiveDemoSection />
      </main>
    </UserShell>
  );
}
