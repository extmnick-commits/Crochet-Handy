# Leftover yarn scan reliability

The Me tab's **Scan Leftover Yarn (Local AI)** opens `ScrapBusterModal`.
The maker can analyze a photo or use **Enter yarn details · find projects now**
to search the bundled tutorial catalog immediately, without a model download.
Both paths require a confirmed yarn category and a rough amount or measured yards.

## Matching behavior

- Only real catalog tutorials are returned. Title hints identify standalone small
  projects; incidental keywords in descriptions and tags do not establish size.
  Blankets, cardigans, large projects, numbered tutorial parts, and pattern-link
  roundups are excluded from this heuristic.
- Compatible yarn categories are filtered before the result limit. Exact category
  matches rank first. Nearby categories explain that substitution changes gauge,
  dimensions, and yardage.
- Positive measured yards accept decimals and correctly grouped thousands.
  Negative values, ranges, units, zero, and malformed numbers show a correction
  prompt. They never silently fall back to a larger rough amount.
- Explicit numeric tutorial requirements, when available, override generic
  project-type estimates. Requirements round up rather than down.
- Rough ranges scope possible ideas; their upper bounds do not prove enough yarn.
  A skein has no standard length and is not converted to 400 yards. Grams are not
  converted to yards without information about the specific yarn.
- Each card identifies an estimate-only idea or an exact-category match within
  the entered yardage. The maker still needs the tutorial's materials, fiber,
  colors, gauge, and any other supplies.

The reviewed catalog snapshot contains 116 tutorials and **no numeric
`tutorialYards`, `yarnYards`, or `requiredYards` fields**. Its cards are therefore
project ideas with estimated yardage, not verified promises that a project can be
finished. Existing seed materials are displayed, but are not promoted to verified
requirements. Adding source-checked requirements to the catalog would allow
stronger quantity matching.

## Scan lifecycle fixes

Selecting another photo clears the prior yarn's yards, grams, findings, and
results. Retake, cancellation, manual entry, and closing the sheet invalidate
pending requests, including photo preparation and model download waits. A new
photo cannot join another photo's inference and receive its findings. Manual
edits survive a failed reanalysis. Draft generation also checks that the confirmed
yarn and pattern request remain current.

Adding a leftover to the stash opens a review form with its category and the
Leftover scrap brand filled in. The maker supplies the color. Rough amounts are
kept as labels rather than invented exact yard totals; the stash's existing data
model does not track leftover yardage.

## Automated validation

```sh
npm ci
npm run typecheck
node --import tsx scripts/check-leftover-matching.ts
node --import tsx scripts/check-leftover-yarn.ts
node --import tsx scripts/check-scrap-yarn-ai.ts
npm run check-helper
CI=1 npx expo export --platform android --output-dir /tmp/crochet-leftover-android
npm run lint
```

The matching check exercises 45 weight/amount combinations against the bundled
catalog, invalid amounts, known requirement boundaries, ranking, manual entry,
fresh-photo state, and draft gating. The AI checks also cover concurrent photos.
This is not a native APK build or an image-accuracy benchmark. The full-repository
lint command reports 58 errors and 2 warnings already present on the base branch;
lint checks on the changed source and test files pass.

## Phone acceptance checks

1. From Me, open the scan sheet and use manual entry with Worsted and 75 yards.
   Confirm that project ideas appear immediately and each opens the right preview.
   Return from a preview and check that the entered details and results survive.
2. Photograph yarn with a readable category label, then unlabeled yarn. Check
   findings against the actual yarn and correct any wrong estimates. Try camera
   permission denial and picker cancellation. Manual matching must remain available.
3. Replace a photo after entering 150 yards. The new scan must start without that
   amount. Try 40.5, -40, 25-75, zero, grams only, and an uncertain yarn category.
4. Cancel during preparation, download, loading, and inference. Switch to manual
   entry or close/reopen the sheet while work is pending. No old findings may
   overwrite the current details. A busy inference may need time to stop before
   another analysis can start.
5. Check nearby yarn-category warnings and an empty result set. Add a leftover to
   the stash and confirm that a rough range is not displayed as exact yards.

Physical Android/iPhone validation and measured photo accuracy remain required.

## IDE handoff

Use Android Studio for native camera and on-device inference debugging. If its AI
quota is unavailable, open the same test branch in Cursor or Antigravity with an
available model. Give the agent this prompt:

```text
Validate the Scan Leftover Yarn flow on branch fix/leftover-yarn-reliability in
Crochet-Handy on a physical phone. Read AGENTS.md and
docs/leftover-yarn-reliability.md first. Run the documented automated checks and
phone acceptance cases. Record device/OS, model preparation and inference times,
observed versus actual labeled yarn category, cancellation behavior, and tutorial
preview navigation. Never infer measured yards or grams from a photo, or present
unknown tutorial yardage as confirmed. Fix reproducible failures within this flow,
add focused regressions, rerun typecheck and changed-file lint, and leave all work
on this branch for review. Do not merge or publish a release.
```
