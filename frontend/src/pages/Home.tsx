import { api } from "../api";
import { useData } from "../hooks/useData";
import {
  Badge,
  FindOpMark,
  OpportunityCard,
  UserShell,
} from "../components/shared";

export function HeroVisual() {
  return (
    <div className="hero-visual discovery-visual">
      <div className="visual-orbit orbit-a" />
      <div className="visual-orbit orbit-b" />
      <div className="findop-orb">
        <FindOpMark />
        <small>FINDOP</small>
      </div>
      <div className="source-node node-a">
        WEB SOURCES
        <br />
        <b>↗ live</b>
      </div>
      <div className="source-node node-b">
        VALIDATED
        <br />
        <b>✓ flowing</b>
      </div>
      <div className="source-node node-c">
        MATCHED
        <br />
        <b>→ for you</b>
      </div>
      <i className="particle particle-a" />
      <i className="particle particle-b" />
      <i className="particle particle-c" />
    </div>
  );
}
export function Landing() {
  const preview = useData(api.opportunities);
  return (
    <UserShell>
      <main className="landing">
        <section className="hero">
          <div className="hero-copy">
            <Badge tone="accent">
              ✦ THE OPPORTUNITY LAYER FOR THE INTERNET
            </Badge>
            <h1>
              Stop searching.
              <br />
              <em>Start discovering.</em>
            </h1>
            <p className="hero-sub">
              FindOP continuously discovers hackathons, fellowships, grants,
              jobs and other opportunities — then helps you find the ones that
              fit.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="/discover">
                Explore opportunities <span>→</span>
              </a>
              <a className="button ghost" href="/preferences">
                Personalize your feed
              </a>
            </div>
            <div className="trust">
              <span>✓</span> Always discovering &nbsp; <span>✓</span> Built to
              recover &nbsp; <span>✓</span> Matched to you
            </div>
          </div>
          <HeroVisual />
        </section>
        <section className="preview-section">
          <div className="section-heading">
            <div>
              <h2>Opportunities worth noticing.</h2>
            </div>
            <a className="text-link" href="/opportunities">
              View all →
            </a>
          </div>
          {preview.data?.length ? (
            <div className="opp-grid preview-grid">
              {preview.data.slice(0, 4).map((x) => (
                <OpportunityCard key={x._id} item={x} />
              ))}
            </div>
          ) : (
            <div className="abstract-preview">
              <span>HACKATHONS</span>
              <span>FELLOWSHIPS</span>
              <span>GRANTS</span>
              <span>JOBS</span>
            </div>
          )}
        </section>
        <section className="demo-banner">
          <div className="demo-banner-copy">
            <p className="eyebrow">LIVE SANDBOX</p>
            <h2>See FindOP scrape a website — live.</h2>
            <p>
              Paste any site, watch real discovery and extraction happen in your
              browser, then break the scraper and watch it heal itself.
            </p>
          </div>
          <a className="button primary demo-banner-cta" href="/demo">
            Try the live demo <span>→</span>
          </a>
        </section>
        <section className="what-findop">
          <div className="what-findop-copy">
            <p className="eyebrow">WHAT IS FINDOP?</p>
            <h2>The opportunity layer that keeps looking.</h2>
            <p>
              FindOP continuously discovers opportunities from across the web —
              hackathons, fellowships, internships, scholarships, grants, jobs,
              and developer programs — and brings them into one place.
            </p>
            <p>
              But FindOP isn't just another opportunity aggregator. It validates
              the data, identifies the opportunities that actually matter, and
              uses a self-healing scraping pipeline to recover when websites or
              extraction patterns change.
            </p>
          </div>
          <div className="what-findop-flow">
            <span>
              <b>01</b>DISCOVER<small>Web data</small>
            </span>
            <i>→</i>
            <span>
              <b>02</b>VALIDATE<small>Data quality</small>
            </span>
            <i>→</i>
            <span>
              <b>03</b>MATCH<small>Personalization</small>
            </span>
            <i>→</i>
            <span>
              <b>04</b>RECOVER<small>Self-healing</small>
            </span>
          </div>
        </section>
        <section className="how-section">
          <p className="eyebrow">A BETTER WAY TO LOOK</p>
          <h2>
            The web changes.
            <br />
            <em>Your shortlist shouldn’t disappear.</em>
          </h2>
          <div className="steps">
            <div>
              <b>01</b>
              <h3>Discover</h3>
              <p>
                FindOP scans public opportunity sources continuously. It
                collects hackathons, fellowships, internships, grants,
                scholarships, jobs, and developer programs from across the web.
              </p>
            </div>
            <div>
              <b>02</b>
              <h3>Understand</h3>
              <p>
                Raw web data becomes structured, trusted information. FindOP
                validates records, removes irrelevant or broken listings,
                identifies the opportunity type, and keeps useful details
                organized.
              </p>
            </div>
            <div>
              <b>03</b>
              <h3>Find your match</h3>
              <p>
                See opportunities that actually fit you. Search and filter by
                category, location, deadline, and other preferences instead of
                checking dozens of websites manually.
              </p>
            </div>
            <div>
              <b>04</b>
              <h3>Recover</h3>
              <p>
                When the web changes, FindOP adapts. Its self-healing scraping
                pipeline detects extraction failures, diagnoses what changed,
                repairs the scraper, and verifies that useful data is flowing
                again.
              </p>
            </div>
          </div>
        </section>
        <section className="healing-story">
          <div>
            <p className="eyebrow">RESILIENT BY DESIGN</p>
            <h2>
              When the web breaks,
              <br />
              <em>FindOP keeps looking.</em>
            </h2>
            <p>
              Sources change. Selectors break. FindOP detects the signal,
              diagnoses the problem and keeps data flowing.
            </p>
          </div>
          <div className="flow">
            <span>Website changes</span>
            <i>↓</i>
            <span>FindOP detects it</span>
            <i>↓</i>
            <span className="flow-good">Data continues flowing</span>
          </div>
        </section>
        <section className="final-cta">
          <p className="eyebrow">YOUR NEXT MOVE</p>
          <h2>
            Your next opportunity
            <br />
            <em>is already out there.</em>
          </h2>
          <a className="button primary" href="/discover">
            Explore opportunities →
          </a>
        </section>
      </main>
    </UserShell>
  );
}
