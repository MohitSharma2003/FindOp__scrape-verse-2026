import { ReactNode, useState } from "react";
import { Opportunity } from "../api";
import { useAuth } from "../auth";
import { consoleRoutes, userRoutes } from "../config/routes";
import {
  formatShortDate as short,
  getSourceLabel as sourceLabel,
} from "../utils/display";

export const labels: Record<string, string> = {
  hackathon: "Hackathons",
  internship: "Internships",
  fellowship: "Fellowships",
  scholarship: "Scholarships",
  grant: "Grants",
  job: "Jobs",
  competition: "Competitions",
  program: "Developer programs",
  conference: "Conferences",
  workshop: "Workshops",
  accelerator: "Accelerators",
  other: "Other",
};

export function FindOpMark() {
  return (
    <svg className="findop-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="findop-gradient" x1="4" y1="3" x2="28" y2="29">
          <stop stopColor="#b0a6ff" />
          <stop offset="1" stopColor="#6659dc" />
        </linearGradient>
      </defs>
      <path
        fill="url(#findop-gradient)"
        d="M8 5.5c0-1.1.9-2 2-2h12.5a2 2 0 1 1 0 4H13v5h7.5a2 2 0 1 1 0 4H13v8.5a2.5 2.5 0 1 1-5 0v-19Z"
      />
      <path
        fill="#67d8ea"
        d="M21.5 13.2a6.8 6.8 0 1 1-1.8 11.1 2 2 0 1 1 2.8-2.8 2.8 0 1 0-.7-4.5 2 2 0 0 1-.3-3.8Z"
      />
    </svg>
  );
}
export function Brand({ consoleMode = false }: { consoleMode?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <FindOpMark />
      </span>
      <span>
        find<span className="accent">op</span>
      </span>
      {consoleMode && <small>/ console</small>}
    </div>
  );
}
export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet";
}) {
  return (
    <button className={`button ${variant}`} {...props}>
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  return <span className={`foundation-badge ${tone}`}>{children}</span>;
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`foundation-card ${className}`}>{children}</section>
  );
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="foundation-input" {...props} />;
}
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="foundation-state">
      <div className="state-icon">◌</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <EmptyState
      title="Couldn’t load opportunities"
      description={`${message}. Check the backend connection and try again.`}
      action={<Button onClick={retry}>Retry</Button>}
    />
  );
}
export function UserNav() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="topbar">
      <a href="/">
        <Brand />
      </a>
      <nav>
        {userRoutes.slice(0, 3).map(([p, l]) => (
          <a href={p} key={p}>
            {l}
          </a>
        ))}
        <a href="/deadlines">Deadlines</a>
        <a href="/console">Console</a>
      </nav>
      {user ? (
        <div className="user-menu">
          {menuOpen && (
            <div
              className="menu-backdrop"
              onClick={() => setMenuOpen(false)}
            />
          )}
          <button
            className="user-trigger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="avatar" aria-hidden="true">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="user-name">{user.name.split(" ")[0]}</span>
            <span className="caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {menuOpen && (
            <div className="user-dropdown" role="menu">
              <div className="dropdown-head">
                <b>{user.name}</b>
                <span>{user.email}</span>
              </div>
              <a href="/profile" role="menuitem" onClick={() => setMenuOpen(false)}>
                Profile
              </a>
              <a
                href="/preferences"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Preferences
              </a>
              <button onClick={logout} role="menuitem">
                Log out
              </button>
            </div>
          )}
        </div>
      ) : (
        <a className="login-nav" href="/login">
          Login
        </a>
      )}
    </header>
  );
}
export function ConsoleNav() {
  const path = window.location.pathname.replace(/\/$/, "") || "/console";
  return (
    <aside className="console-nav">
      <a href="/console">
        <Brand />
      </a>
      <div className="nav-label">WORKSPACE</div>
      {consoleRoutes.map(([p, l], i) => (
        <a href={p} key={p} className={path === p ? "selected" : ""}>
          <NavIcon index={i} />
          <span>{l}</span>
        </a>
      ))}
      <div className="console-foot">
        <i className="status-dot healthy" /> API foundation ready
        <br />
        <span>v0.1.0 · development</span>
      </div>
    </aside>
  );
}
const NAV_ICON_PATHS: ReactNode[] = [
  <path key="overview" d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z" />,
  <path key="sources" d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v18M4 7.5l8 4.5 8-4.5" />,
  <g key="runs">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 3" />
  </g>,
  <g key="validation">
    <circle cx="12" cy="12" r="8" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
  </g>,
  <path key="healing" d="M3 12h4l2-6.5 4 13 2-6.5h6" />,
  <path key="opportunities" d="M4 6h16M4 12h16M4 18h10" />,
  <g key="system">
    <path d="M4 8h8M18 8h2M4 16h4M14 16h6" />
    <circle cx="15" cy="8" r="2.2" />
    <circle cx="11" cy="16" r="2.2" />
  </g>,
];

export function NavIcon({ index }: { index: number }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {NAV_ICON_PATHS[index % NAV_ICON_PATHS.length]}
    </svg>
  );
}
export function BrightDataSection() {
  return (
    <section className="bright-data">
      <div>
        <p className="eyebrow">POWERED BY BRIGHT DATA</p>
        <h2>
          Reliable web data,
          <br />
          <em>built to keep moving.</em>
        </h2>
        <p>
          FindOP uses Bright Data’s web-data infrastructure and Scraper Studio
          to continuously discover and structure opportunities from public
          sources.
        </p>
      </div>
      <div className="bright-capabilities">
        <div>
          <b>◈</b>
          <strong>Scraper Studio</strong>
          <span>Structured extraction workflows</span>
        </div>
        <div>
          <b>↯</b>
          <strong>Self-healing extraction</strong>
          <span>Resilient when sources change</span>
        </div>
        <div>
          <b>◷</b>
          <strong>Continuous monitoring</strong>
          <span>Fresh signals over time</span>
        </div>
      </div>
    </section>
  );
}
export function UserShell({ children }: { children: ReactNode }) {
  return (
    <div className="user-shell">
      <UserNav />
      {children}
      {window.location.pathname === "/" && <BrightDataSection />}
      <footer>
        <Brand />
        <span>Opportunity intelligence for people building what’s next.</span>
        <span>© 2026 FindOP</span>
      </footer>
    </div>
  );
}
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="console-shell">
      <ConsoleNav />
      <main className="console-main">{children}</main>
    </div>
  );
}
export function MatchBadge({ score }: { score?: number }) {
  return (
    <div className={`match-badge ${score ? "known" : "pending"}`}>
      <strong>{score ? `${score}%` : "—"}</strong>
      <span>{score ? "MATCH" : "MATCH PENDING"}</span>
    </div>
  );
}
export function SaveButton({ id }: { id: string }) {
  const { isAuthenticated } = useAuth();
  const [saved, setSaved] = useState(() =>
    JSON.parse(localStorage.getItem("findop-saved") || "[]").includes(id),
  );
  const toggle = () => {
    if (!isAuthenticated) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const ids: string[] = JSON.parse(
      localStorage.getItem("findop-saved") || "[]",
    );
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    localStorage.setItem("findop-saved", JSON.stringify(next));
    setSaved(!saved);
    window.dispatchEvent(new Event("findop-saved"));
  };
  return (
    <button
      className={`save ${saved ? "saved" : ""}`}
      onClick={toggle}
      aria-label={
        isAuthenticated
          ? saved
            ? "Remove saved opportunity"
            : "Save opportunity"
          : "Sign in to save opportunity"
      }
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
export function OpportunityStatus({ status }: { status?: string }) {
  const value = status?.trim();
  if (!value || value.toLowerCase() === "unknown") return null;
  return (
    <Badge tone={value.toLowerCase() === "closed" ? "danger" : "success"}>
      {value}
    </Badge>
  );
}
export function OpportunityCard({
  item,
  match,
}: {
  item: Opportunity;
  match?: { score: number; reasons: string[] };
}) {
  const pct = match ? Math.round(match.score) : undefined;
  return (
    <article className="opp-card">
      <div className="card-top">
        <span className="category">
          {labels[item.category] || item.category}
        </span>
        <SaveButton id={item._id} />
      </div>
      <div className="opp-card-main">
        <MatchBadge score={pct} />
        <h3>{item.title}</h3>
        <p className="organization">
          {item.organization || "Organization not listed"}
        </p>
        <p className="description">
          {item.description || "Opportunity details available from the source."}
        </p>
        {match?.reasons?.length ? (
          <ul className="match-reasons">
            {match.reasons.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        <div className="meta">
          <span>◷ {short(item.deadline)}</span>
          <span>
            ⌖{" "}
            {item.mode === "remote"
              ? "Remote"
              : item.location || "Location not listed"}
          </span>
        </div>
        {item.skills?.length ? (
          <div className="tags">
            {item.skills.slice(0, 3).map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="card-bottom">
        <OpportunityStatus status={item.status} />
        <a className="text-link" href={`/opportunities/${item._id}`}>
          View details →
        </a>
      </div>
    </article>
  );
}
