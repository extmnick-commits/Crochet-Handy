# Daily pattern catalog

The Pattern catalog workflow runs daily at **10:17 UTC** (3:17 a.m. Pacific daylight time / 2:17 a.m. Pacific standard time). GitHub can delay scheduled runs. The schedule becomes active only after the workflow is on the default branch and GitHub Actions is enabled.

- Monday–Saturday: `scrape-only`, `variety`, target 10 new tutorials. Searches amigurumi, wearables, blankets, granny squares, beanies, socks, coasters, bags, and home decor. Screened candidates are selected round-robin so one category cannot take the whole batch.
- Sunday: `scrape-and-prune`, `variety`, target 10 new tutorials across the same categories. Rechecks the catalog with text and thumbnail rules once a week. Seasonal topics remain available for manual runs.
- Daily scraping still checks new candidates for duplicates, English text, and thumbnail suitability. Ten is a target, not a guarantee: sources, quality filters, API quotas, or errors can reduce the count.
- Search is limited to six pages per topic (at most 54 search calls in a nine-category run), and overlapping catalog jobs on the same branch are serialized. Publishing rebases over unrelated commits; a conflict fails instead of overwriting changes.

The existing GitHub Environment `.env` must contain `YOUTUBE_API_KEY` and `GEMINI_API_KEY`; `GEMINI_MODEL` is optional. Environment approvals and branch protection must permit unattended runs and catalog commits. Check **Actions → Pattern catalog** for failures; this code change does not verify production secrets or API availability.

To test immediately, use **Run workflow** on the test branch with `scrape-only`, `granny-squares`, count `10`. This publishes to the selected branch. The released app reads `main`, so test-branch catalogs do not reach production users until merged. Full cleanup remains available manually.

The app already fetches the remote catalog at startup and on pull-to-refresh. It now selects the newest valid `generatedAt` snapshot from the CDN and raw GitHub, even if cleanup reduced the number of patterns. Existing offline fallback remains. A new app build/update is required for the **Granny Squares** chip and snapshot-selection fix; daily catalog additions can reach existing versions through their current sync.

Granny Squares is a dedicated year-round feed category and manual scrape topic. Existing titles and legacy tags such as `granny-square` and `granny square` match without retagging the catalog. A granny-square blanket may appear in both Granny Squares and Blankets.

Local checks:

```sh
npx tsx scripts/check-crochet-machine.ts
npm run typecheck
npm run lint
```
