# FindOP backend

## Run

From `backend/`, install dependencies, create `.env`, then run:

```text
npm run dev
npm run typecheck
npm run build
npm test
```

Production uses `npm start` after `npm run build`. `npm run seed:devfolio`
creates the existing Devfolio source idempotently.

## Architecture

HTTP routes call thin controllers, which validate input and delegate to
services. Services coordinate repositories and external integrations; models
own MongoDB schemas and indexes. The main flow is
`Source → Bright Data → Ingestion → Opportunity/MongoDB → Health → Healing`.

## Configuration

Required: `MONGODB_URI`. Optional: `PORT`, `BRIGHT_DATA_API_TOKEN`,
`BRIGHT_DATA_TIMEOUT_MS`, `BRIGHT_DATA_POLL_INTERVAL_MS`,
`BRIGHT_DATA_HEALING_TIMEOUT_MS`, and `SELF_HEALING_ENABLED` (defaults to
`false`). Keep `.env` local; it is ignored by Git.

## API

`GET/POST /api/opportunities`, `GET /api/opportunities/:id`

`GET/POST /api/sources`, `GET /api/sources/:id`,
`POST /api/sources/:id/scrape`, `GET /api/sources/:id/health`,
`POST /api/sources/:id/heal`, `GET /api/sources/:id/healing`

`GET/POST /api/scrape-runs`, `GET /api/scrape-runs/:id`

`POST /api/search/intent` validates and normalizes structured search intent;
it does not perform discovery or web search.

`POST /api/search` runs the bounded discovery, extraction, filtering, and
ranking pipeline. Example request:

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

The response contains ranked results with the canonical opportunity, score,
breakdown, reasons, uncertainties, and filtering decision, plus operational
metadata. The limit defaults to 20 and accepts values from 1 to 50. Empty
results are successful responses. Individual extraction failures are counted
without discarding successful extractions; critical discovery, filtering, or
ranking failures return a controlled error.

Responses use `{ success, data }` on success and
`{ success: false, error: { code, message } }` on failure.

## Flow

Scraping triggers Bright Data, validates and normalizes records, deduplicates
and persists opportunities, then records health metrics. Failed health checks
can be diagnosed and repaired through the bounded self-healing flow. Healing
does not run automatically unless explicitly enabled, and Bright Data approval
is still required where the provider requests it.
