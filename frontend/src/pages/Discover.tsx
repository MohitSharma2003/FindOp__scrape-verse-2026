import { useEffect, useMemo, useState } from "react";
import { api, Opportunity } from "../api";
import { useData } from "../hooks/useData";
import {
  Card,
  EmptyState,
  ErrorState,
  OpportunityCard,
  Skeleton,
  UserShell,
  labels,
} from "../components/shared";

type DiscoveryState = {
  status: "idle" | "loading" | "done" | "error";
  items: Opportunity[];
  matches?: Record<string, { score: number; reasons: string[] }>;
  meta?: import("../api").DiscoverySearchMeta;
  error?: string;
};

/** Tiles shown per page before the "Show more" button loads the next batch. */
const PAGE_SIZE = 15;

export function OpportunityList({
  title = "Discover opportunities",
}: {
  title?: string;
}) {
  const stats = useData(api.indexStats);
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [indexLoading, setIndexLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [indexError, setIndexError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const [search, setSearch] = useState<DiscoveryState>({
    status: "idle",
    items: [],
  });

  const loadPage = async (offset: number) => {
    const page = await api.opportunitiesPage(PAGE_SIZE, offset);
    return page;
  };

  useEffect(() => {
    let active = true;
    setIndexLoading(true);
    setIndexError("");
    loadPage(0)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setTotal(page.total);
        setHasMore(page.hasMore);
      })
      .catch((e: Error) => active && setIndexError(e.message))
      .finally(() => {
        if (active) setIndexLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const showMore = async () => {
    if (!items || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadPage(items.length);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (e) {
      setIndexError(e instanceof Error ? e.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const categories = [
    "all",
    "hackathon",
    "internship",
    "fellowship",
    "scholarship",
    "grant",
    "job",
    "competition",
    "program",
  ];

  const searching = search.status === "loading";
  const source = search.status === "idle" ? items || [] : search.items;
  const data = useMemo(
    () =>
      source.filter(
        (x) =>
          (category === "all" || x.category === category) &&
          `${x.title} ${x.organization || ""} ${x.description || ""} ${(x.skills || []).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [source, query, category],
  );

  const runSearch = async () => {
    setSearch({ status: "loading", items: items || [] });
    try {
      const res = await api.discoverySearch({
        query: query.trim(),
        category: category === "all" ? undefined : category,
        location: location.trim() || undefined,
        deadlineWithinDays: deadlineDays ? Number(deadlineDays) : undefined,
        fresh: true,
      });
      setSearch({
        status: "done",
        items: res.results.map((r) => r.opportunity),
        matches: Object.fromEntries(
          res.results.map((r) => [
            r.opportunity._id,
            { score: r.score, reasons: r.reasons || [] },
          ]),
        ),
        meta: res.meta,
      });
    } catch (e) {
      setSearch({
        status: "error",
        items: items || [],
        error: e instanceof Error ? e.message : "Search failed",
      });
    }
  };

  const meta = search.meta;
  return (
    <UserShell>
      <main className="page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">OPPORTUNITY INTELLIGENCE</p>
            <h1>{title}</h1>
            <p>
              Search the live web with Bright Data — results are structured,
              validated and saved to your index.
            </p>
            {stats.data && (
              <p className="index-stats">
                {stats.data.totalOpportunities.toLocaleString()} opportunities
                indexed · {stats.data.enabledSources} sources
                {stats.data.lastUpdatedAt
                  ? ` · updated ${Math.max(1, Math.round((Date.now() - new Date(stats.data.lastUpdatedAt).getTime()) / 60000))} min ago`
                  : ""}
              </p>
            )}
            {stats.data && stats.data.scrapesRunningNow > 0 && (
              <p className="discovery-status live">
                ◌ Updating opportunity index… ({stats.data.scrapesRunningNow}{" "}
                source scrape{stats.data.scrapesRunningNow === 1 ? "" : "s"}{" "}
                running)
              </p>
            )}
          </div>
        </div>
        <div className="filters">
          <div className="search">
            ⌕
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search hackathons, fellowships, grants…"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
          </div>
          <div className="chips">
            {categories.map((x) => (
              <button
                key={x}
                className={category === x ? "active" : ""}
                onClick={() => setCategory(x)}
              >
                {x === "all" ? "All" : labels[x] || x}
              </button>
            ))}
          </div>
          <div className="discovery-bar">
            <input
              className="foundation-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (e.g. India) or Remote"
            />
            <select
              className="foundation-input"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              aria-label="Deadline window"
            >
              <option value="">Any deadline</option>
              <option value="1">Closing today</option>
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
              <option value="90">Next 3 months</option>
            </select>
            <button
              className="button primary"
              disabled={searching}
              onClick={() => void runSearch()}
            >
              {searching ? "Searching…" : "Find opportunities"}
            </button>
          </div>
        </div>
        {searching && (
          <p className="discovery-status live">
            ◌ Searching existing records and the live web via Bright Data…
          </p>
        )}
        {!searching && search.status === "done" && meta && (
          <p className="discovery-status">
            Found {meta.resultCount}{" "}
            {meta.resultCount === 1 ? "opportunity" : "opportunities"}
            {meta.newRecords > 0 && (
              <>
                {" "}
                · <b className="good">{meta.newRecords} new</b> from the web
              </>
            )}
            {meta.updatedRecords > 0 && <> · {meta.updatedRecords} updated</>}
            {" · "}
            {meta.freshness === "refreshed"
              ? "fresh"
              : meta.freshness === "stale"
                ? "showing stored records"
                : "no data"}
            {meta.webSearched && (
              <>
                {" "}
                · web searched
                {meta.candidatesDiscovered
                  ? ` (${meta.candidatesDiscovered} candidates)`
                  : ""}
              </>
            )}
          </p>
        )}
        {!searching && (search.status === "error" || meta?.discoveryError) && (
          <p className="discovery-status warn">
            ⚠ {meta?.discoveryError || search.error} — showing previously
            indexed results.
          </p>
        )}
        {indexLoading && search.status === "idle" ? (
          <div className="opp-grid">
            {[1, 2, 3].map((x) => (
              <Card key={x}>
                <Skeleton className="skeleton-line" />
                <Skeleton className="skeleton-block" />
              </Card>
            ))}
          </div>
        ) : indexError && search.status === "idle" && !items ? (
          <ErrorState message={indexError} retry={() => window.location.reload()} />
        ) : data.length ? (
          <>
            <div className="opp-grid">
              {data.map((x) => (
                <OpportunityCard
                  key={x._id}
                  item={x}
                  match={
                    search.status === "done"
                      ? search.matches?.[x._id]
                      : undefined
                  }
                />
              ))}
            </div>
            {search.status === "idle" && hasMore && (
              <div className="show-more-wrap">
                <button
                  className="button ghost show-more"
                  disabled={loadingMore}
                  onClick={() => void showMore()}
                >
                  {loadingMore
                    ? "Loading…"
                    : `Show more (${items?.length ?? 0} of ${total})`}
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title={
              search.status === "done"
                ? "No opportunities found for that search"
                : "Nothing matched that search"
            }
            description={
              search.status === "done"
                ? "Try broader keywords or a longer deadline window."
                : "Try another keyword or category. Use Find opportunities to search the live web."
            }
          />
        )}
      </main>
    </UserShell>
  );
}
