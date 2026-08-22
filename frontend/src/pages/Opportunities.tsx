import { ReactNode, useEffect, useState } from "react";
import { api, Opportunity } from "../api";
import { useAuth } from "../auth";
import { useData } from "../hooks/useData";
import {
  formatDate as fmt,
  formatShortDate as short,
  getSourceLabel as sourceLabel,
} from "../utils/display";
import {
  Card,
  EmptyState,
  ErrorState,
  MatchBadge,
  OpportunityCard,
  SaveButton,
  Skeleton,
  Button,
  UserShell,
  labels,
} from "../components/shared";

export function Detail({ id }: { id: string }) {
  const r = useData(() => api.opportunity(id), [id]);
  const item = r.data;
  return (
    <UserShell>
      <main className="page detail-page">
        {r.loading ? (
          <Skeleton className="detail-skeleton" />
        ) : r.error ? (
          <ErrorState message={r.error} retry={r.retry} />
        ) : item ? (
          <>
            <a className="back" href="/discover">
              ← Back to discovery
            </a>
            <div className="detail-grid">
              <section>
                <div className="detail-kicker">
                  <span className="category">
                    {labels[item.category] || item.category}
                  </span>
                  <MatchBadge />
                </div>
                <h1>{item.title}</h1>
                <p className="organization big">
                  {item.organization || "Organization not listed"}
                </p>
                <div className="detail-tags">
                  <span>◷ Deadline {fmt(item.deadline)}</span>
                  <span>
                    ⌖{" "}
                    {item.mode === "remote"
                      ? "Remote"
                      : item.location || "Location not listed"}
                  </span>
                </div>
                <DetailBlock title="About">
                  <p>
                    {item.description ||
                      "No description was provided by the source."}
                  </p>
                </DetailBlock>
                <DetailBlock title="Eligibility">
                  <p>{item.eligibility || "Not available from the source."}</p>
                </DetailBlock>
                {item.skills?.length ? (
                  <DetailBlock title="Skills & topics">
                    <div className="tags">
                      {item.skills.map((x) => (
                        <span key={x}>{x}</span>
                      ))}
                    </div>
                  </DetailBlock>
                ) : null}
                <DetailBlock title="Source">
                  <p>
                    {sourceLabel(
                      item.opportunityUrl || item.url || item.source,
                    )}{" "}
                    · Last verified {fmt(item.scrapedAt)}
                  </p>
                </DetailBlock>
              </section>
              <aside className="apply-panel">
                <p className="eyebrow">OPPORTUNITY STATUS</p>
                <h2>{item.status || "Unknown"}</h2>
                <div className="panel-row">
                  <span>Deadline</span>
                  <strong>{short(item.deadline)}</strong>
                </div>
                {item.startDate || item.endDate ? (
                  <div className="panel-row">
                    <span>Dates</span>
                    <strong>
                      {short(item.startDate)} – {short(item.endDate)}
                    </strong>
                  </div>
                ) : null}
                {item.mode && item.mode !== "any" ? (
                  <div className="panel-row">
                    <span>Mode</span>
                    <strong>
                      {{
                        remote: "Remote",
                        in_person: "In person",
                        hybrid: "Hybrid",
                      }[item.mode] || item.mode}
                    </strong>
                  </div>
                ) : null}
                <div className="panel-row">
                  <span>Location</span>
                  <strong>
                    {item.location || (item.mode === "remote" ? "Remote" : "—")}
                  </strong>
                </div>
                {item.prize ? (
                  <div className="panel-row">
                    <span>Prize</span>
                    <strong>{item.prize}</strong>
                  </div>
                ) : null}
                <a
                  className="button primary full"
                  href={item.applicationUrl || item.opportunityUrl || item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.applicationUrl ? "Apply now ↗" : "Open opportunity ↗"}
                </a>
                <SaveButton id={item._id} />
                <a
                  className="button ghost full"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source ↗
                </a>
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </UserShell>
  );
}
export function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-block">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function Saved() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("findop-saved", refresh);
    return () => window.removeEventListener("findop-saved", refresh);
  }, []);
  const r = useData(() => api.opportunities(), [tick]);
  const ids: string[] = JSON.parse(
    localStorage.getItem("findop-saved") || "[]",
  );
  const items = (r.data || []).filter((x) => ids.includes(x._id));
  return (
    <UserShell>
      <main className="page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR SHORTLIST</p>
            <h1>Saved opportunities</h1>
            <p>Keep the opportunities worth coming back to close at hand.</p>
          </div>
        </div>
        {r.loading ? (
          <Skeleton className="skeleton-block" />
        ) : r.error ? (
          <ErrorState message={r.error} retry={r.retry} />
        ) : items.length ? (
          <div className="opp-grid">
            {items.map((x) => (
              <OpportunityCard key={x._id} item={x} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing saved yet"
            description="Save opportunities you want to come back to."
            action={
              <a className="button primary" href="/discover">
                Discover opportunities
              </a>
            }
          />
        )}
      </main>
    </UserShell>
  );
}
export function Deadlines() {
  const r = useData(api.opportunities);
  const items = [...(r.data || [])]
    .filter((x) => x.deadline && new Date(x.deadline) >= new Date())
    .sort(
      (a, b) =>
        new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime(),
    );
  return (
    <UserShell>
      <main className="page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">DEADLINE RADAR</p>
            <h1>Your deadline radar</h1>
            <p>Keep the next important date in view.</p>
          </div>
        </div>
        {r.loading ? (
          <Skeleton className="skeleton-block" />
        ) : r.error ? (
          <ErrorState message={r.error} retry={r.retry} />
        ) : items.length ? (
          <div className="deadline-list">
            {items.map((x) => (
              <a
                className="deadline-row"
                href={`/opportunities/${x._id}`}
                key={x._id}
              >
                <div>
                  <span className="category">
                    {labels[x.category] || x.category}
                  </span>
                  <h3>{x.title}</h3>
                  <p>{x.organization || "Organization not listed"}</p>
                </div>
                <div className="deadline-date">
                  <strong>{short(x.deadline)}</strong>
                  <span>
                    {Math.ceil(
                      (new Date(x.deadline!).getTime() - Date.now()) / 86400000,
                    )}{" "}
                    days left
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No upcoming deadlines"
            description="Upcoming opportunity deadlines will appear here from collected opportunities."
          />
        )}
      </main>
    </UserShell>
  );
}
export function Preferences() {
  const interests = [
    "AI",
    "Machine Learning",
    "Web Development",
    "Data Science",
    "Cybersecurity",
    "Cloud",
    "Open Source",
    "Research",
  ];
  const types = ["Hackathons", "Fellowships", "Grants", "Jobs", "Competitions"];
  const [selected, setSelected] = useState<string[]>(
    JSON.parse(localStorage.getItem("findop-preferences") || "[]"),
  );
  const toggle = (x: string) =>
    setSelected((s) => (s.includes(x) ? s.filter((y) => y !== x) : [...s, x]));
  return (
    <UserShell>
      <main className="page preferences">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PERSONALIZATION</p>
            <h1>Make FindOP yours.</h1>
            <p>
              Choose a few signals. Your future feed can do the heavy lifting.
            </p>
          </div>
        </div>
        <Card>
          <h2>What are you interested in?</h2>
          <p className="form-help">Select everything that sounds like you.</p>
          <div className="select-grid">
            {interests.map((x) => (
              <button
                className={selected.includes(x) ? "selected" : ""}
                onClick={() => toggle(x)}
                key={x}
              >
                {selected.includes(x) ? "✓ " : ""}
                {x}
              </button>
            ))}
          </div>
          <h2>What opportunities?</h2>
          <div className="select-grid">
            {types.map((x) => (
              <button
                className={selected.includes(x) ? "selected" : ""}
                onClick={() => toggle(x)}
                key={x}
              >
                {selected.includes(x) ? "✓ " : ""}
                {x}
              </button>
            ))}
          </div>
          <Button
            onClick={() => {
              localStorage.setItem(
                "findop-preferences",
                JSON.stringify(selected),
              );
            }}
          >
            Update preferences
          </Button>
        </Card>
      </main>
    </UserShell>
  );
}
export function Profile() {
  const { user } = useAuth();
  const name = user?.name || "FindOP user";
  return (
    <UserShell>
      <main className="page preferences">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR SPACE</p>
            <h1>Profile</h1>
            <p>Your FindOP profile and personalization settings.</p>
          </div>
        </div>
        <Card>
          <div className="profile-row">
            <div className="profile-avatar">
              {name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2>{name}</h2>
              <p className="form-help">{user?.email}</p>
            </div>
          </div>
          <a className="button primary" href="/preferences">
            Edit preferences →
          </a>
        </Card>
      </main>
    </UserShell>
  );
}
