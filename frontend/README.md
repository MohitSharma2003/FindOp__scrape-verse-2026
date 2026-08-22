# FindOP — Frontend

> The opportunity layer that keeps looking.

The FindOP frontend is the user-facing web application for **FindOP**, a self-healing opportunity intelligence platform built for **Scrape-Verse 2026**. It ships two experiences in one SPA:

- **User app** — discover and browse opportunities collected from across the web
- **Operator console** — observe the scraping, validation, indexing and self-healing pipeline behind them

---

## Features

| Surface | Route | What it does |
|---|---|---|
| Landing | `/` | Product overview with a CTA into the Live Demo Sandbox |
| **Live Demo Sandbox** | `/demo` | Scrape **any** website in real time: SERP discovery → parallel extraction → classification → verification. One-click **Break** poisons the scraper, **Heal** runs the repair pipeline and auto-corrects the config. Saved scrapers can be promoted into the production Sources registry |
| Discover | `/discover` | Search opportunities by intent (category, keywords, location, mode, date) |
| Opportunities | `/opportunities` | Browse the full validated index |
| Saved | `/saved` | Personal shortlist |
| Deadlines | `/deadlines` | Deadline tracker |
| Preferences | `/preferences` | Feed personalization |
| Console | `/console/*` | Sources, scrape runs, validation, self-healing, system stats |

---

## Tech Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 8](https://vite.dev/) for dev server and builds
- Hand-rolled CSS design system (`foundation.css`, `styles.css`, `console.css`) — no UI framework dependency
- Thin typed API client (`src/api.ts`) wrapping all backend endpoints

---

## Getting Started

```bash
npm install
npm run dev        # start dev server → http://localhost:5173
```

The client expects the FindOP backend on `http://localhost:5000/api`. To point elsewhere:

```env
# .env.local
VITE_API_URL=https://your-backend.example.com/api
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build locally |

---

## Project Structure

```text
frontend/src/
├── api.ts                  # Typed backend client (opportunities, sources,
│                           #   search, demo sandbox) + shared model types
├── pages/                  # Route-level views
│   ├── Home.tsx            #   Landing page
│   ├── LiveDemoSection.tsx #   Live Demo Sandbox (page + embeddable section)
│   ├── Discover.tsx        #   Intent search
│   └── …                   #   Opportunities, Saved, Deadlines, Preferences…
├── console/                # Operator console surfaces
├── components/shared/      # Shared UI kit (cards, shells, badges…)
├── config/routes.ts        # Navigation registries (user + console)
└── foundation.css          # Design tokens & base styles
```

---

## Backend Contract

All requests go through `src/api.ts` and expect the backend envelope:

```jsonc
// success
{ "success": true, "data": { ... } }
// failure
{ "success": false, "error": { "code": "DEMO_INVALID_STATE", "message": "…" } }
```

See [`../backend/README.md`](../backend/README.md) for the complete API reference.
