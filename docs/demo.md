# FindOP demo guide

The demo should show both the user experience and the reliability layer behind
it.

1. Open FindOP and discover indexed opportunities.
2. Search and filter by category, location, and deadline.
3. Open an opportunity to show its normalized details and source link.
4. Open the developer console and show source health, scrape runs, validation,
   and the opportunity index.
5. Run or inspect a source scrape and show the recorded quality signals.
6. Demonstrate a failure or an existing failed run.
7. Show the diagnosis and Bright Data repair state in the self-healing console.
8. Run the verification scrape and show the recovered or escalated result.

The Bright Data portions require valid backend credentials and configured
source/collector data. Scraping, provider polling, and healing can take
significant time; the demo should allow for those operations instead of
presenting them as instantaneous.
