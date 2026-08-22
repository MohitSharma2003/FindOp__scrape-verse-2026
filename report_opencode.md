
---

## POST-AUDIT FIXES APPLIED (2026-08-22)

1. Match score/reasons now surfaced: Discover results show % badge + top 3 "why it matches" reasons (Discover.tsx, shared.tsx, styles.css). Build verified.
2. Production hygiene: `CORS_ORIGIN` env added (allow-list in production), request logging gated to non-production, `SELF_HEALING_ENABLED=true` set.
3. Deployment packaging added: `render.yaml` (backend blueprint w/ health check), `frontend/vercel.json` (SPA rewrites), full step-by-step README deployment section incl. post-deploy seeding.
4. Cleanup: OpenHackathons source disabled in registry (dead collector), `probe-serp.ts` removed.
5. Data-depth push executed honestly: enrichment batches (fill-empty re-extraction) + maintenance pass ran; result: category corrections applied, but deadline/org/skills coverage remains low (deadline=0/95) because the generic extraction collector cannot recover that depth from listing-style pages. **Known limitation** — closing it requires per-site Scraper Studio collectors or an LLM-extraction key (none configured).

Verification after fixes: backend typecheck clean, 279/279 tests pass, frontend build clean, live index healthy (95 opportunities, scheduler active).

Updated assessment: **Brief implementation ~82% · Demo readiness ~78%**. Remaining before recording the demo video: deploy via README steps, rehearse the poison?heal?recovered scenario with auto-heal now ON, and lead the narrative with search/ranking/reliability strengths rather than card depth.

---

# DEMO SCRIPT — Breaking & Self-Healing a Scraper (record this video)

**What you will prove:** "The website changed, the scraper broke, and FindOP recovered without a developer fixing code."

**Setup before recording (one time):**
- Backend running locally (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`).
- MongoDB Atlas open in a browser tab, logged in, Browse Collections ready.
- The Console Sources table now has **Scrape now** and **Heal** buttons on every source row — the whole demo happens inside FindOP's UI.
- Recommended source: **Devpost Hackathons** (SERP discovery sources heal fastest, ~2-4 min; collector sources like Devfolio take 5-10 min).

---

## Scene 1 - Healthy state (30 sec)
1. Open `/console/sources`. Point at **Devpost Hackathons**: green `healthy` badge, recent successful run.
2. Open `/` (Discover). Read the stats line: "**N opportunities indexed · M sources · updated X min ago**".
> Say: "FindOP continuously scrapes 13 public sources through Bright Data. Here is Devpost — healthy, scraped minutes ago."

## Scene 2 - Break the scraper (45 sec)
3. Go to MongoDB Atlas tab ? `sources` collection ? find **Devpost Hackathons** ? edit `discoveryKeywords` ? replace with `["zzqxjunknomatch"]` ? Save.
> Say: "This simulates the website changing its structure. Our discovery queries now return nothing useful."

## Scene 3 - Watch it fail and self-diagnose (~2 min)
4. In FindOP `/console/sources`, click **Scrape now** on the Devpost row. Button shows "Scraping…".
5. When it finishes: status flips to ?? `unhealthy`, last run = **failed**, failures counter increments, and the note shows the run outcome.
6. Switch to `/console/runs`: the newest run shows **failed** with validation/health reasons.
7. Because automatic healing is ON, the pipeline immediately starts diagnosing and attempting repair — visible as healing state changes on the source and run.
> Say: "Validation detected zero valid records — the run failed. Health analysis marked the source unhealthy and self-healing started automatically."
> (Video tip: cut/timelapse the wait, keep timestamps visible.)

## Scene 4 - Heal it (~2 min)
8. Back to Atlas: restore `discoveryKeywords` to `["site:devpost.com", "hackathons 2026"]`.
9. In FindOP, click **Heal** on the Devpost row. Button shows "Healing…".
10. Healing picks the failed run, repairs by re-running discovery with fresh candidates, then runs a verification scrape that must pass deterministic validation before being accepted.
11. When finished the note shows "? Healing finished". Open `/console/healing`: a new event for Devpost with badge **recovered** and timestamps.

## Scene 5 - The product never broke (30 sec)
12. Open `/` ? click **Find opportunities** ? cards render, stats line says "updated just now", match badges show % + reasons.
13. Closing line: "The website changed, the scraper broke, and FindOP recovered itself — no developer touched the code."

## Optional credibility beat (+30 sec)
- On `/console/sources`, show **OpenHackathons**: permanently unhealthy (its Bright Data collector was deleted — real 403), healing attempted and correctly **escalated** instead of faking recovery.
> Say: "When repair is genuinely impossible, FindOP escalates honestly instead of pretending to recover."

---

## Recording tips
- Record at 1080p; do the Atlas edits BEFORE rolling where possible, roll only the UI moments.
- Keep console timestamps in frame during cuts - they prove the timeline is real.
- Total raw footage ~10 min ? final cut 3-4 min.
