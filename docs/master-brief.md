# Scrape-Verse 2026 — Project Master Brief
## Public Opportunity Radar

### Official Source
WeMakeDevs — Scrape-Verse 2026  
https://www.wemakedevs.org/hackathons/scrape-verse

The official hackathon page remains the final authority for rules, dates, eligibility, credits, submission requirements, judging, and technology capabilities.

---

## 1. Mission

Build a competitive, polished product for Scrape-Verse 2026 with the goal of winning.

The product is **Public Opportunity Radar**: an AI-powered opportunity intelligence platform that continuously discovers relevant public opportunities, structures and validates them, matches them to users, and remains reliable when monitored websites change.

The initial focus is **hackathons and developer-oriented opportunities**. Future categories may include fellowships, grants, research programs, competitions, startup programs, scholarships, and similar public opportunities.

### Product North Star

> **Find opportunities people would otherwise miss — and keep finding them even when the web changes.**

This is not simply a scraper, opportunity aggregator, or chatbot.

---

## 2. The User Problem

Useful opportunities are fragmented across many websites. Users may have to repeatedly check different sources for:

- New opportunities
- Deadlines
- Eligibility
- Location / remote status
- Topics and skills
- Organization information
- Application links

Automation also becomes unreliable because websites change their HTML, structure, selectors, content layout, or extraction patterns.

We solve both problems:

**Discovery:** continuously find opportunities from public sources.  
**Reliability:** detect extraction failures and recover when sources change.

---

## 3. Core Product Experience

A user provides preferences such as:

- Interests / skills
- Opportunity type
- Location
- Remote preference
- Education / career level
- Deadline preferences

The system discovers opportunities and presents relevant matches.

Example:

**AI Hackathon — 94% Match**

Deadline: 28 August 2026  
Location: Remote  
Eligibility: Students and developers

Why it matches:
- AI related
- Hackathon
- Remote
- Student eligible

The match should be explainable, not an unexplained AI score.

Users should be able to view the original/application source and, where useful, save opportunities or receive notifications.

---

## 4. Core Data Pipeline

The intended product flow is:

**Public Website**
→ **Bright Data Scraper Studio**
→ **Collector**
→ **Structured Data**
→ **Validation**
→ **Normalization**
→ **Deduplication**
→ **Classification / Extraction**
→ **Opportunity Database**
→ **Matching**
→ **Frontend**

Bright Data Scraper Studio must be a meaningful/core part of the product, not a superficial API call.

The exact Bright Data CLI/API/agent workflow must be verified against current official documentation.

---

## 5. Bright Data + Scraper Studio

Scraper Studio is a core/required technology for the hackathon.

The expected workflow is conceptually:

Describe required data
→ Create/configure scraper in Scraper Studio
→ Run collector
→ Receive structured output
→ Use output inside the product

The scraper should enable the product rather than be the entire product.

The project should investigate Bright Data's supported CLI/API/coding-agent workflow because the Web-Slinger track values how the scraper is designed, operated, handles website changes, and powers the final product.

---

## 6. Standard Opportunity Model

Different websites represent opportunities differently. We normalize them into a common internal model.

Conceptual fields:

- title
- organization
- description
- category
- opportunity URL
- application URL
- deadline
- start/end dates
- location
- remote
- eligibility
- skills/topics
- tags
- source
- source URL
- last verified

The final schema will be determined after testing real sources.

---

## 7. Validation

A successful HTTP request or scraper run does **not** mean the extracted data is correct.

Example failure:

```json
{
  "title": "AI Hackathon",
  "deadline": null,
  "eligibility": null
}
```

Validation should detect:

- Missing required fields
- Invalid URLs
- Invalid/unparseable dates
- Empty results
- Unexpected data formats
- Sudden drops in result counts
- Important fields disappearing
- Other source-specific quality failures

Validation is essential because it determines whether a scraper has actually succeeded.

---

## 8. Self-Healing

Self-healing is a central hackathon requirement and a major product demonstration.

Example:

Initial extraction:

title ✓  
deadline ✓  
eligibility ✓  
application URL ✓

Website changes.

New extraction:

title ✓  
deadline ✗  
eligibility ✗  
application URL ✓

The system should:

**Scrape**
→ **Validate**
→ **Detect failure**
→ **Diagnose change**
→ **Generate/perform repair**
→ **Re-run**
→ **Validate**
→ **Accept only if valid**

If successful:

**Source recovered**
→ store valid data
→ resume monitoring

If unsuccessful:

**Retry / escalate**
→ mark source unhealthy
→ preserve previous valid data
→ report failure

### Critical rule

Never trust an AI-generated repair merely because it executes successfully.

A repair must pass deterministic validation before being accepted.

---

## 9. AI / LLM Role

AI should be used where it provides genuine value, not simply because this is a hackathon.

Potential uses:

- Opportunity classification
- Semi-structured information extraction
- Semantic matching
- Match explanations
- Diagnosing extraction failures
- Reasoning about structural/semantic website changes
- Suggesting repair strategies

AI may reason or propose.

Deterministic validation should verify critical results.

We do not need to train our own ML model unless later evidence gives us a strong reason.

---

## 10. Source Registry

The system should maintain a registry of monitored sources.

Conceptual fields:

- Source ID
- Name
- URL
- Opportunity category
- Bright Data collector reference
- Expected schema
- Health status
- Last successful run
- Last failure
- Failure count
- Last healing event

This supports monitoring, debugging, and the technical self-healing dashboard.

Example:

```text
SOURCE HEALTH

WeMakeDevs    🟢 Healthy
Source B      🟢 Healthy
Source C      🟡 Self-Healed
Source D      🔴 Failed
```

---

## 11. Freshness and Deduplication

Opportunity data is time-sensitive.

Track:

- Last scraped
- Last verified
- Deadline
- Source health
- Opportunity status

Potential statuses:

- New
- Active
- Deadline approaching
- Expired
- Source uncertain

Duplicate opportunities from multiple websites should be consolidated using signals such as:

- Application URL
- Organization
- Title similarity
- Deadline
- Description similarity

Source provenance should be preserved.

---

## 12. Product UI

The main interface should feel like a real opportunity product, not a scraping dashboard.

Possible dashboard:

**Your Opportunities**

- Best Matches
- Deadlines Approaching
- Newly Discovered
- Saved

Opportunity cards should show:

- Title
- Organization
- Match score
- Deadline
- Location
- Remote status
- Skills/topics
- Eligibility
- Why it matches
- Application/source link

A separate technical/admin view can expose:

- Source health
- Scrape runs
- Validation failures
- Healing events

---

## 13. The Main Demo

The most important demo should prove that the product survives a website change.

Recommended flow:

1. Show a real source working.
2. Show an opportunity being discovered.
3. Show structured data powering the product.
4. Intentionally change/simulate a source-structure change.
5. Run the scraper.
6. Show validation detecting missing/incorrect fields.
7. Show self-healing diagnosis/repair.
8. Re-run the collector.
9. Validate recovered data.
10. Show the opportunity continuing to work in the product.

Core message:

> **The website changed, the scraper broke, and the product recovered without a developer manually fixing the scraper.**

The demo should prove the functionality rather than merely describe it.

---

## 14. MVP Scope

First prove:

1. User preference setup
2. A small number of public opportunity sources
3. Bright Data Scraper Studio integration
4. Structured opportunity extraction
5. Validation
6. Normalized database
7. Opportunity listing UI
8. Basic personalized matching
9. Failure detection
10. Self-healing demonstration

Do not initially attempt:

- Hundreds of sources
- Every opportunity category
- Mobile apps
- Large-scale infrastructure
- Complex social features
- Advanced notifications
- Overly complicated recommendation algorithms

Expand only after the core pipeline works.

---

## 15. Development Order

Highest-risk functionality must be validated early.

### Phase 1
Validate real public opportunity sources and Bright Data/Scraper Studio.

### Phase 2
Build one complete vertical slice:

**Source → Bright Data → Backend → Database → UI**

### Phase 3
Add validation.

### Phase 4
Introduce and detect a controlled failure.

### Phase 5
Implement and validate self-healing.

### Phase 6
Add more sources.

### Phase 7
Add matching, classification, and explanations.

### Phase 8
Polish UI and technical dashboards.

### Phase 9
Stress-test failure scenarios.

### Phase 10
Prepare demo and final submission.

Do not spend significant time polishing the UI before proving the scraping/self-healing pipeline.

---

## 16. Winning Strategy

The project should aim to score strongly across the official judging dimensions:

### Potential Impact
Solve a meaningful problem for identifiable users.

### Creativity & Innovation
Go beyond an obvious scraping use case.

### Technical Excellence
Show strong architecture, reliability, code quality, integration, and robustness.

### Use of Scraper Studio
Make Bright Data central to collecting the data that powers the product.

### Reliability & Self-Healing
Demonstrate that the system can detect and recover from website changes.

### Presentation
Clearly communicate the problem, solution, architecture, Bright Data integration, self-healing, and user value.

---

## 17. Judged Tracks

### Web-Slinger — Best Use of Bright Data

Emphasize:

- Scraper quality
- Scraper Studio usage
- How the scraper is operated
- Handling website changes
- Structured output powering the product
- Coding-agent integration where applicable

### Suit-Up — Best UI

Emphasize:

- Visual quality
- UX
- Product polish
- Clarity
- Finished/usable experience

### Spider-Sense — Best Clean Code

Emphasize:

- Readability
- Structure
- Maintainability
- Engineering practices
- Code quality

A strong submission should aim to perform well across all three.

---

## 18. Competition Positioning

Do not pitch the product as:

- "An AI scraper"
- "Another opportunity aggregator"
- "A chatbot"

The stronger positioning is:

> **A self-healing opportunity intelligence platform that continuously discovers, validates, and personalizes public opportunities even as the websites providing that information change.**

The opportunity discovery solves the user problem.

The self-healing system solves the reliability problem.

Bright Data powers web-data collection.

AI provides reasoning where useful.

Our product logic connects these into a useful experience.

---

## 19. What Could Make This Fail

Avoid:

1. Building a beautiful dashboard before proving scraping.
2. Treating Bright Data as a superficial integration.
3. Calling something self-healing without demonstrating recovery.
4. Trusting invalid scraped data.
5. Using AI everywhere without justification.
6. Trying to scrape the entire web.
7. Building too many features.
8. Choosing sources that cannot be reliably collected.
9. Turning the product into a generic aggregator.
10. Over-engineering the architecture.

The project should favor a smaller, reliable, polished product over a huge unfinished one.

---

## 20. Hackathon Context

Scrape-Verse is centered on useful products powered by self-healing web scrapers.

The official brief identifies:

**Six equally weighted judging areas:**

1. Potential Impact
2. Creativity & Innovation
3. Technical Excellence
4. Use of Scraper Studio
5. Reliability & Self-Healing
6. Presentation

The hackathon also provides three judged tracks:

- Web-Slinger — Best Use of Bright Data
- Suit-Up — Best UI
- Spider-Sense — Best Clean Code

AI coding tools/agents are allowed, including Codex, Claude Code, Cursor, and others, but participants are expected to understand, verify, and explain submitted work.

Participants receive **$50 in Bright Data credits** for building/testing the project.

The project should use publicly available web data and must not scrape private, login-protected, paywalled, restricted, or otherwise prohibited information.

The official hackathon page is the final authority for all rules and current details.

---

## 21. Current Status

Hackathon:
Scrape-Verse 2026

Product:
Public Opportunity Radar

Initial category:
Hackathons / developer opportunities

Target users:
Students, developers, researchers, early-career technical users

Product name:
Not finalized

Sources:
Not finalized

Technology stack:
Not finalized

Architecture:
Conceptual

Bright Data:
Not integrated yet

Self-healing:
Not implemented

Frontend:
Not implemented

Backend:
Not implemented

Database:
Not implemented

Demo:
Not implemented

---

## 22. Important Principle

This document describes the **current product direction**, not an immutable implementation specification.

Before major development:

- Validate real sources.
- Validate Bright Data capabilities.
- Validate self-healing feasibility.
- Validate product differentiation.
- Validate hackathon-time feasibility.

If evidence shows that a source, feature, architecture, or even the product direction is weak, change it.

Do not continue building the wrong thing simply because it was written here.

The objective is:

> **Build the strongest, most reliable, most memorable product we can within the hackathon constraints.**
