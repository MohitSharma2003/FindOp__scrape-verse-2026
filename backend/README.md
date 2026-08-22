# FindOP — Backend

> Self-healing opportunity intelligence platform — API, pipeline and integrations.

The FindOP backend is an Express + TypeScript service that discovers public opportunities (hackathons, fellowships, internships, scholarships, grants, jobs, competitions, developer programs), converts inconsistent web data into one validated structure, stores it in a searchable index, and keeps sources healthy through a bounded self-healing workflow. It also hosts the public **Live Demo Sandbox** used during judging.

---

## Quick Start

```bash
npm install
cp .env.example .env    # or create .env manually
npm run dev             # http://localhost:5000
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with watch/reload (`tsx`) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled build (production) |
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit`) |
| `npm test` | Build then run all 290 tests via `node:test` |
| `npm run seed:devfolio` | Idempotently seed the existing Devfolio source |
| `npm run maintain:opportunities` | Maintenance pass over stored opportunities |
| `npm run enrich:opportunities` | Enrichment pass over stored opportunities |
| `npm run seed:index-sources` | Seed the discovery index sources |

---

## Configuration

Configuration is validated with Zod at boot. Required vs optional:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `PORT` | — | `5000` | HTTP port |
| `CORS_ORIGIN` | — | — | Allowed browser origin |
| `BRIGHT_DATA_API_TOKEN` | live scraping | — | Bright Data account token |
| `BRIGHT_DATA_SERP_ZONE` | — | `serp_api1` | SERP zone name |
| `BRIGHT_DATA_EXTRACTION_COLLECTOR_ID` | live extraction | — | Generic extraction collector |
| `BRIGHT_DATA_EXTRACTION_COLLECTOR_VERSION` | — | — | Collector version pin |
| `BRIGHT_DATA_COLLECTOR_DELIVERY_WEBHOOK` | — | — | Delivery webhook URL |
| `BRIGHT_DATA_TIMEOUT_MS` | — | `180000` | Per-request timeout |
| `BRIGHT_DATA_POLL_INTERVAL_MS` | — | `5000` | Dataset polling interval |
| `BRIGHT_DATA_HEALING_TIMEOUT_MS` | — | `180000` | Healing collector timeout |
| `SELF_HEALING_ENABLED` | — | `false` | Opt-in automatic healing |

Keep `.env` local; it is ignored by Git.

---

## Architecture

HTTP routes call thin controllers, which validate input and delegate to services. Services coordinate repositories and external integrations; models own MongoDB schemas and indexes.

```text
Source ──► SERP discovery ──► parallel extraction ──► validation
                                                              │
Healing ◄── health monitoring ◄── opportunity index ◄── ingestion
```

Main flow: **`Source → Bright Data → Ingestion → Opportunity/MongoDB → Health → Healing`.**

Key modules under `src/`:

| Module | Responsibility |
|---|---|
| `modules/sources/` | Source registry, resolver, provisioning, scrape orchestration, ingestion |
| `modules/opportunities/` | Opportunity repository and index stats |
| `discovery/` | Query building and candidate URL extraction from SERP results |
| `extraction/` | Record extraction and normalization via Bright Data collectors |
| `ingestion/` | Validation, deduplication, category classification |
| `search/` | Intent parsing/filtering/ranking for user-facing search |
| `health/` | Source health analysis |
| `healing/` | Bounded self-healing workflow (diagnose → repair → verify) |
| `demo/` | Public Live Demo Sandbox — isolated collections, rate-limited |

---

## API

All responses use the envelope `{ success, data }` on success and `{ success: false, error: { code, message } }` on failure.

### Opportunities

- `GET /api/opportunities` · `POST /api/opportunities`
- `GET /api/opportunities/:id`

### Sources

- `GET /api/sources` · `POST /api/sources`
- `GET /api/sources/:id`
- `POST /api/sources/:id/scrape`
- `GET /api/sources/:id/health`
- `POST /api/sources/:id/heal`
- `GET /api/sources/:id/healing`

### Scrape Runs

- `GET /api/scrape-runs` · `GET /api/scrape-runs/:id`

### Search

- `POST /api/search/intent` — validates and normalizes structured search intent (no discovery performed)
- `POST /api/search` — runs bounded discovery → extraction → filtering → ranking:

```json
{
  "intent": {
    "type": "hackathon",
    "keywords": ["AI"],
    "location": { "country": "India" },
    "mode": "remote",
    "date": { "kind": "next_month" }
  },
  "limit": 10
}
```

The response contains ranked results with the canonical opportunity, score breakdown, reasons, uncertainties and filtering decision, plus operational metadata. The limit defaults to 20 (1–50). Individual extraction failures are counted without discarding successful extractions; critical failures return a controlled error.

### Live Demo Sandbox (`/api/demo`)

An isolated, rate-limited playground that mirrors the production pipeline on any website. Runs are ephemeral (45-min TTL) and never touch production data until explicitly promoted.

| Endpoint | Method | Notes |
|---|---|---|
| `/api/demo/state` | GET | Latest sandbox run (records, stats, healing timeline) |
| `/api/demo/scrape` | POST | `{ url, category }` — starts async run, returns `202` |
| `/api/demo/break` | POST | One-click sabotage: poisons config category |
| `/api/demo/heal` | POST | Diagnose → repair → verify; auto-corrects config |
| `/api/demo/reset` | POST | Wipe all runs back to a pristine state |
| `/api/demo/scrapers` | GET | Persisted scrapers incl. durable `lastRecords` |
| `/api/demo/promote` | POST | Promote a saved scraper into the Sources registry (idempotent) |

Rate limits per IP: heavy actions (scrape/heal) 8 per 10 min; light actions (break/reset/promote) 20 per min.

---

## Flow & Safety

Scraping triggers Bright Data, validates and normalizes records, deduplicates and persists opportunities, then records health metrics. Failed health checks can be diagnosed and repaired through the bounded self-healing flow.

- Healing does not run automatically unless `SELF_HEALING_ENABLED=true`.
- Bright Data approval is still required where the provider requests it.
- Sandbox data lives in dedicated collections and expires automatically.
