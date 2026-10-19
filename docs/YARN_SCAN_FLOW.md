# Yarn photo scan

## Visual Breakdown

The existing mark is a green yarn ball with a separate diagonal crochet hook. Both PNG layers use the same transparent 1254 × 1254 canvas. The loading view keeps their registration: the ball lifts slightly and the hook pulls and turns around its canvas center. A horizontal scan line travels down and back over the selected photo. There are no extra logo words or particles.

The scan line uses `#37EE79`, sampled from `assets/yarn-ball.png`. Other sampled greens include `#2FEC73` and `#29EA6E`; dark yarn pixels include `#012612`. The photo veil is a derived transparent black. Screen text and surfaces use the existing theme.

## Asset Setup

| Asset | Canvas | Display | Order | Anchor | Motion |
| --- | --- | --- | --- | --- | --- |
| `assets/yarn-ball.png` | 1254 × 1254 | 96 × 96 pt | 2 | Center, 627 / 627 px | Lift 4 pt and return |
| `assets/crochet-hook.png` | 1254 × 1254 | 96 × 96 pt | 3 | Center, 627 / 627 px | Lift 5 pt, turn 5°, return |
| `assets/logo-cutout.png` | 1254 × 1254 | 96 × 96 pt | 2 | Center | Static Reduce Motion fallback |
| Scan line | View | Photo width × 3 pt | 1 | Top left | Travel over the 220 pt photo |

No new dependencies, asset edits, SDK upgrade, or native configuration are required for this change. It uses Expo 57, React Native 0.86, and core Animated. Native transforms run with the native driver; the web driver is used on web. Loops stop on unmount and while the app is inactive. The initial accessibility check completes before motion starts.

## Drop-in Component Code

`components/YarnScanLoading.tsx` is the complete loading component. `components/ScrapBusterModal.tsx` mounts it only while scanning and passes the photo, current stage, and real transfer progress. Inference has no invented percentage.

The default flow is:

1. Capture or choose a photo. Analysis starts automatically once the picker returns.
2. Fill the detected subjects, yarn category, label text, hook marking, stitches, and rough amount into the existing in-memory draft.
3. Open matching catalog projects immediately. Details and stash actions are under **Edit yarn details**. The separate pattern-generation form is no longer shown in this project-search sheet.
4. Match edited details without calling the model again. Returning from a project preview reuses the saved photo, details, and results. A new scan requires a new photo or the explicit detailed-scan action.

Unknown thickness or amount produces labeled small-project ideas instead of blocking the screen. An explicit no-yarn or hook-only finding produces no yarn matches. Exact leftover grams and yards are never invented; user-entered values are retained for retakes. Start over clears the session.

### Speed changes

`utils/scrapVisionConfig.ts` defines quick and detailed profiles. The default photo long edge is reduced from 768 to 448 pixels, and the vision encoder's maximum image tokens are reduced from 512 to 256. The scan language context is reduced from 4096 to 2048 tokens. Text pattern generation retains its original 4096-token context.

The prompt no longer supplies a fully uncertain example for the model to copy. It asks for supported visual estimates while preserving uncertainty when the image cannot answer. Both model pins and the existing native SHA-256 verification remain unchanged.

The supplied Android logs showed 152–166 seconds of prompt/image processing, 7–27 seconds of model loading, and 4–7 seconds of output generation. These are the old scan's observed timings. This change reduces work; a speedup and any accuracy tradeoff must be measured on the same phone and photos.

### Validation

- TypeScript check passed.
- Existing scrap AI and leftover-yarn checks passed. The AI checks now also verify quick/detailed token budgets and prevent an overlapping new photo from receiving an older photo's result.
- Catalog checks with a stubbed Expo Constants adapter passed: unknown weight/amount suggestions, no yarn, hook only, small amount limits, entered yards precedence, and strict-search compatibility.
- Lint passed for all changed TypeScript files. Full `npm run lint` is blocked by 57 errors and 2 warnings in existing files outside this change.
- Expo web export passed.
- Visual browser automation could not run: the environment had no browser binary, and the browser download returned an invalid archive. Native camera, animations, GPU behavior, scan accuracy, timing, memory, and FPS require physical-device review. No new performance measurements are claimed.

### Device review

Use a development or preview build that includes the repository's existing `scrap-file-hash` native module. Scan the same sample photos in quick and detailed modes. Record total scan time, detected details, native prompt-evaluation time, backend, and peak memory. Compare accuracy before changing the default again.

Check automatic capture-to-results, optional correction fields, matching without another model call, project preview/back, double taps, cancel during preparation/loading/inference, start over, close/reopen, background/resume, and system Reduce Motion. Verify the loop on both Android and iPhone before claiming a frame rate.

## Tuning Sliders

These are code constants, not extra controls shown to app users:

| Control | Location | Default | Practical tuning |
| --- | --- | --- | --- |
| Quick image size / tokens | `utils/scrapVisionConfig.ts` | 448 px / 256 | Test 384–512 px and 192–384 tokens against the same photos |
| Detailed image size / tokens | Same | 768 px / 512 | Keep as the explicit slower option for unclear details |
| Scan sweep | `TIMING.scanMs` in `YarnScanLoading.tsx` | 1800 ms each way | 1400–2400 ms |
| Logo half-cycle | `TIMING.logoHalfMs` | 900 ms | 700–1400 ms |
| Ball / hook lift | `MOTION.ballLift`, `hookPull` | −4 / −5 pt | Keep within about 2–6 pt |
| Hook rotation | `MOTION.hookDegrees` | 5° | About 2–6° |

### Cursor handoff

Recommended environment: Cursor with Claude Opus 5.5; fallback: Composer 2.5 if quota is exhausted.

Copy-paste prompt:

> Review the `codex/faster-yarn-scan` branch in Crochet Handy and read `docs/YARN_SCAN_FLOW.md`. Preserve its automatic photo-to-project-results flow, editable detected details, unknown-value labeling, and existing logo artwork. Install a development or preview build on the available physical Android phone or iPhone; include the existing scrap-file-hash native module if the installed app predates it. Compare quick (448 px / 256 image tokens) and detailed (768 px / 512 image tokens) scans on the same yarn, label, hook, mixed-yarn, and no-yarn photos. Record total latency, native prompt-evaluation time, backend, accuracy, and peak memory. Check preview/back reuse, double taps, cancellation, close/reopen, background/resume, small screens, and Reduce Motion. Adjust the profile only if the measurements support it. Run typecheck, the scrap AI and leftover-yarn checks, and lint on changed files. Report measured results and remaining limitations; do not claim a speedup or frame rate without device evidence. Do not merge or publish a store release during this review.
