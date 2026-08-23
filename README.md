<h3 align="center"><img width="450" height="120" alt="ChatGPT Image " src="https://github.com/user-attachments/assets/390b68f3-6c66-481b-95e7-94994105c23c" />
</h3>

<p align="center">
  <strong>The opportunity layer that keeps looking.</strong><br/>
  Discover opportunities across the web and keep discovering them even when the web changes.
</p>

<p align="center">

 [![Scrape-Verse 2026](https://img.shields.io/badge/Scrape--Verse-2026-7C5CFC?style=for-the-badge)](https://www.wemakedevs.org/hackathons/scrape-verse)
[![Bright Data](https://img.shields.io/badge/Powered%20by-Bright%20Data-1677FF?style=for-the-badge)](https://brightdata.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)

</p>


---------

## About

https://www.youtube.com/embed/Vk23XVYTbJs

FindOP is a self-healing opportunity intelligence platform. It continuously discovers public opportunities — hackathons, fellowships, internships, scholarships, grants, jobs, competitions and developer programs — converts inconsistent web data into one validated structure, and keeps data flowing even when websites change and scrapers break.

> **FindOP finds opportunities people would otherwise miss — and keeps finding them when the web changes.**

--------

## Screenshots

### Landing Page
<img width="1919" height="967" alt="image" src="https://github.com/user-attachments/assets/cf5d96ce-9e8e-4654-976a-12dda03e5b91" />



### Opportunity Section
<img width="1919" height="970" alt="image" src="https://github.com/user-attachments/assets/0895b7c4-7313-474b-b5c9-bc1b6f8a781e" />


### Console
<img width="1919" height="973" alt="image" src="https://github.com/user-attachments/assets/d28419ce-b157-4d7f-8f84-25ee056c12ec" />

### Self-Healing
<img width="1919" height="969" alt="image" src="https://github.com/user-attachments/assets/8db5804f-68fe-40b0-9a09-e3d50f2e3072" />



<!-- ------------------------------------------------------------------
     Add product screenshots below. Recommended images to capture:

       docs/images/home.png            – Landing page
       docs/images/demo-sandbox.png    – Live Demo Sandbox mid-scrape
       docs/images/demo-healed.png     – Break → Heal verdict timeline
       docs/images/discover.png        – Discover feed
       docs/images/console.png         – Operator console (sources/healing)

     Uncomment a block and drop the image at the shown path.
------------------------------------------------------------------- -->

<!--
<p align="center">
  <img src="docs/images/home.png" alt="FindOP landing page" width="820" />
  <br/><em>Landing page</em>
</p>
-->

<!--
<p align="center">
  <img src="docs/images/demo-sandbox.png" alt="Live Demo Sandbox" width="820" />
  <br/><em>The Live Demo Sandbox scraping any website in real time</em>
</p>
-->

<!--
<p align="center">
  <img src="docs/images/console.png" alt="Operator console" width="820" />
  <br/><em>Operator console — sources, runs and self-healing</em>
</p>
-->


----------

## The Problem

The internet is full of opportunities, but they are scattered across hundreds of websites with different formats, incomplete information and shifting URLs. Finding them means repeatedly checking many sources, comparing details manually and chasing deadlines.

And there is a second problem that is easy to overlook: **the web changes.** A scraper that works today can silently stop working tomorrow when a site changes its structure, layout or content.

So there are really two problems:

1. How do we continuously discover opportunities?
2. How do we keep that discovery reliable when the web inevitably changes?

---

## The Solution

FindOP answers both.

| Capability | What it means |
|---|---|
| 🔎 **Discover** | SERP-driven discovery finds opportunity pages across any public website — not just a fixed source list |
| 🧩 **Structure** | Raw web data is normalized into one canonical opportunity model (title, organization, category, deadline, location, links…) |
| ✅ **Validate** | Every record passes validation, deduplication and category classification before it enters the index |
| 🩹 **Self-heal** | Health monitoring detects failing sources, diagnoses what changed, repairs the scraper via Bright Data, re-scrapes and verifies recovery |
| 🎯 **Match** | Search intent (category, keywords, location, mode, date window) drives filtering and ranking so users see what fits them |
| 🖥 **Observe** | An operator console exposes sources, scrape runs, validation results and healing timelines |

### Live Demo Sandbox

The flagship demo experience: paste **any** website, pick an opportunity category, and watch FindOP discover, extract, classify and verify records in real time — then press **Break** to poison the scraper's configuration and watch the self-healing pipeline diagnose, repair and recover it.

```
Scrape ──► Discover ──► Extract ──► Classify ──► Verify ──► HEALTHY
                                                            │
                                                     [Break it]
                                                            ▼
Heal ◄── Repair ◄── Diagnose ◄──────────────────────── BROKEN
  │
  └──► RECOVERED — configuration auto-corrected and verified
```

Saved scrapers can be promoted into the production Sources registry with one click.

---

## Architecture

```text
┌───────────────────────────── FindOP Platform ─────────────────────────────┐
│                                                                           │
│   React Frontend ──► Express API ──► Services ──► MongoDB                 │
│        (user app +          │              │                               │
│         operator console)   │              └── Opportunity index,           │
│                             │                  sources, scrape runs,       │
│                             ▼                  health & healing state      │
│                     Bright Data APIs                                      │
│                (SERP search · extraction ·                                │
│                      healing collector)                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

**Pipeline:** `Source → SERP discovery → parallel extraction → validation → classification → ingestion → opportunity index → health monitoring → bounded self-healing`

Every HTTP route calls a thin controller, which validates input and delegates to services; services coordinate repositories and integrations; models own schemas and indexes. See [`backend/README.md`](backend/README.md) for the full API reference and [`frontend/README.md`](frontend/README.md) for the client architecture.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, TypeScript, Express 5 |
| Database | MongoDB (Mongoose) |
| Web unblocking | Bright Data — SERP API, extraction collector, healing collector |
| Testing | `node:test` — 290 automated tests |

---

## Project Structure

```text
scrape-verse-2026/
├── backend/          # Express API, discovery/extraction/healing pipeline
│   └── src/
│       ├── demo/             # Public Live Demo Sandbox (isolated from prod)
│       ├── modules/sources/  # Source registry, provisioning, ingestion
│       ├── modules/opportunities/
│       ├── discovery/        # Query building, candidate extraction
│       ├── extraction/       # Record extraction & normalization
│       ├── ingestion/        # Validation, deduplication, classification
│       ├── search/           # Intent parsing, filtering, ranking
│       ├── health/           # Source health analysis
│       ├── healing/          # Bounded self-healing workflow
│       └── integrations/brightdata/
└── frontend/         # React SPA — landing, user app, operator console
    └── src/
        ├── pages/        # Home, Discover, Opportunities, LiveDemoSection…
        ├── components/   # Shared UI kit
        └── console/      # Operator console surfaces
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- A MongoDB instance (local or Atlas)
- A Bright Data account token (for live scraping; the app runs without it, but discovery/extraction need it)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # or create .env manually (see backend/README.md)
npm run dev                 # http://localhost:5000
```

Minimal `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/findop
BRIGHT_DATA_API_TOKEN=<your-token>
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

`VITE_API_URL` defaults to `http://localhost:5000/api`.

---

## Testing

```bash
cd backend
npm test                    # builds then runs all 290 tests (node:test)
npm run typecheck           # strict TypeScript check
```

---

## Built For

**FindOP** was built for [**Scrape-Verse 2026**](https://www.wemakedevs.org/hackathons/scrape-verse) by WeMakeDevs, powered by [Bright Data](https://brightdata.com/) web data infrastructure.
