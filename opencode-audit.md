# FindOP — Self-Healing Demo & Ops Audit

**Status: READY FOR DEMO.** Every step below was executed end-to-end against the live stack on Aug 22, 2026. All timings are real observations, not estimates.

---

## 1. Verified state

| Check | Result |
|---|---|
| Backend tests | 279/279 passing (`npm test`) |
| Typecheck | clean (`npm run typecheck`) |
| Frontend build | clean (~190 ms) |
| Full break→heal→recover cycle | **proven**: fail in ~49 s → auto-escalation → `recovered` in ~185 s, records persisted (4 found / 4 valid) |
| Index stats endpoint | `/api/index/stats` live |

### Code fixes landed during dry-run testing (final state)

1. **Relevance vs. query scoping split** — `discoveryKeywords` scope the SERP queries only; result relevance uses category terms + junk filter (`backend/src/modules/sources/source-scrape.service.ts`, `backend/src/discovery/discovery.service.ts`). This makes keyword corruption *invisible* to relevance (good), and category corruption a deterministic kill switch.
2. **Zero-record runs now fail honestly** — `zeroRecordsFailure: ingestion.recordsFound === 0` instead of hardcoded `false` (`source-scrape.service.ts`).

---

## 2. Run the project locally

### Prerequisites
- Node 22+, MongoDB Atlas cluster reachable (IP whitelisted), Bright Data API credentials in `backend/.env`
- `backend/.env` must contain: `MONGODB_URI`, `BRIGHTDATA_*`, `SELF_HEALING_ENABLED=true`

### Start backend (port 5000)
```powershell
cd backend
npm run dev
```
Wait for `Server listening on :5000`. Sanity check:
```powershell
Invoke-RestMethod http://localhost:5000/api/health
Invoke-RestMethod http://localhost:5000/api/index/stats
```

### Start frontend (port 5173)
```powershell
cd frontend
npm run dev
```
Open `http://localhost:5173`. Console pages of interest: **Console → Sources**, **Console → Healing**, **Discover**.

### One-time data setup (already done — skip unless DB is fresh)
```powershell
cd backend
npm run seed:index-sources
```

---

## 3. THE DEMO — break a scraper, watch it heal itself

**Demo target: "SERP Discovery — Internships"** (source id `6a8914ab086046c8a84b86ca`).
Why this one: highest extraction quality today (100% valid rate in recent runs), fastest heal cycle, and its recovery bar is met reliably. Site-scoped sources (Devpost/Internshala brand pages) currently validate at only 27–62% because listing pages yield thin records — do **not** use them for the recovery scene.

The breaker we corrupt is the source's **category** field, not keywords. Category drives both the search queries and the local relevance gate, so corrupting it guarantees zero candidates → zero records → honest failure, deterministically.

### Scene 1 — show the healthy system (~1 min)
1. Open **Console → Sources**: all rows green, `healthy`.
2. Open **Discover**, search e.g. `hackathon`: results with match % + reasons.
3. Show **Console → Healing**: history of past recoveries.

### Scene 2 — break it (Atlas UI, ~30 s)
In MongoDB Atlas → Browse Collections → `test.sources`, find document `_id: 6a8914ab086046c8a84b86ca`, edit field:
```json
category: "internship"  →  category: "zzqxjunknomatch"
```
Narrate: *"we just corrupted this scraper's config — imagine the site changed its topic overnight."*

### Scene 3 — detect & fail honestly (~50 s)
On **Console → Sources**, click **Scrape now** on that row.
Observed: button spins ~49 s → toast **FAILED** → row flips red `unhealthy`, reason `zero_records_failure`. The system refuses to pretend success.

### Scene 4 — auto-healing kicks in (~1–2 min, hands-off)
Do nothing. Within seconds the scheduler starts automatic repair attempts (visible in backend logs as extra scrape cycles). After **2 failed attempts** the source shows `healing: escalated` on the **Healing** page.
Narrate: *"it tried twice on its own, couldn't fix a broken config, and escalated for a human."*

### Scene 5 — one-click recovery (~3 min)
Fix the config back in Atlas (`category: "internship"`), then click **Heal** on the source row.
Observed pipeline: diagnostic run → re-scrape → verification scrape passes → row returns green.
Observed: HTTP 200 after **185 s**, `status=recovered`; latest run `found 4 / valid 4` records persisted into the index; **Discover** shows the new internships immediately.
Final source state: `health=healthy`, `healing=recovered`.

### Contingencies
- If Heal's first verification lands on a noisy SERP batch, click **Heal** once more — each attempt takes ~60–90 s. (Quality fluctuates per run; two clicks were never needed on the recommended target.)
- An `escalated` ending is still a good story: *"the system knows what it can't fix alone."*
- Do not demo-break Devpost Hackathons today — its generic extraction quality is degraded (49% valid); it will fail verification and stall Scene 5.

### Timing summary (measured)
| Event | Time |
|---|---|
| Poisoned scrape → FAILED | ~49 s |
| Auto-repair attempts → escalated | ~1–2 min |
| Restore + Heal → RECOVERED | ~185 s |
| Total demo arc | **~5–6 min** |

---

## 4. Known limitations (be upfront if asked)

- **Deadline coverage = 0%**: generic extraction rarely recovers structured dates. Fixing properly needs per-site collectors or an LLM extraction key. The dashboard states this honestly rather than faking it.
- **Site-scoped sources have lower valid rates** (listing pages → thin records). They still contribute; they're just not demo material.
- **OpenHackathons** collector is disabled (upstream API permanently 403s). Used as the escalation example.
- Match scores are lexical (no embeddings/LLM configured).

## 5. Deployment quick reference

- **Backend**: `render.yaml` blueprint at repo root (Render free tier, env vars from dashboard).
- **Frontend**: `frontend/vercel.json` (SPA rewrites) → import repo in Vercel, root = `frontend`.
- Set `CORS_ORIGIN` on Render to the Vercel URL (prod gates CORS allow-list; dev stays open).
