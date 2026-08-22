# FindOP architecture

FindOP has a React/TypeScript frontend, an Express/TypeScript backend, and a
MongoDB persistence layer. The backend coordinates discovery, Bright Data
requests, ingestion, validation, normalization, health analysis, and healing.

```mermaid
flowchart TD
  Sources[Public web sources] --> BrightData[Bright Data APIs]
  BrightData --> Discovery[Discovery and scraping]
  Discovery --> Validation[Validation and normalization]
  Validation --> Mongo[(MongoDB opportunity index)]
  Mongo --> API[FindOP backend API]
  API --> Frontend[FindOP frontend]
  Frontend --> User[User]
```

## Self-healing flow

The backend records scrape quality and execution health. When a configured,
healable failure is detected, it diagnoses the failure, requests a Bright Data
collector repair, polls the repair status, runs a verification scrape, and
records the recovered, failed, or escalated result.

```mermaid
flowchart TD
  Scrape[Scrape] --> Failure{Health failure?}
  Failure -- no --> Healthy[Store healthy run]
  Failure -- yes --> Diagnose[Analyze and diagnose]
  Diagnose --> Repair[Bright Data repair request]
  Repair --> Verify[Verification scrape]
  Verify --> Result[Record recovered, failed, or escalated]
```

Healing is disabled by default and may require provider approval, depending on
the Bright Data response.
