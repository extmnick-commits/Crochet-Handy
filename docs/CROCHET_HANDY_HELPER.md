# Crochet Handy Helper test branch

This branch adds an official in-app AI helper. Main is not modified or merged.

## Try it

```sh
git fetch origin
git switch codex/crochet-handy-helper
npm ci
npm run check-helper
npm run typecheck
npm run start:dev
```

Open the installed development client and connect to Metro. A development client that includes the repository's current `llama.rn` and `scrap-file-hash` native modules can run this JavaScript change. Expo Go and web can use the calculators and local catalog search, but not native chat.

If your installed app predates those native modules, create a preview build from this branch:

```sh
npx eas-cli@latest build --platform android --profile preview
```

For an iPhone internal preview, register the phone with the existing Apple/EAS setup and build:

```sh
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

Install from the completed EAS link. Preview builds include their JavaScript and do not require Metro. Keep the existing project environment/signing configuration. No new native dependency, model download, or store submission is introduced by this branch.

## Where it appears

After signing in, tap the floating **Helper** button above the main tab bar. Inside pattern details and catalog previews, tap **Ask Helper**. The chat is an overlay within that screen, so minimizing it leaves the pattern/project in place. Android Back closes the helper first when a pattern modal is open.

The About chip lets you choose the current screen/pattern, active project, or general help. Messages carry the context label that was used. Earlier questions from another pattern are excluded from the next model prompt. Project tracker values and stored pattern excerpts are explicitly described as unverified estimates/reference material, not a complete original tutorial.

Starter actions include explaining a pattern, stitch calculations, yarn calculations, mistake checks, and finding beginner coaster patterns.

## Calculators

Calculators use local TypeScript arithmetic and work before model downloads finish:

- Remaining length from grams remaining and the label's weight/length ratio.
- Whole skeins required, rounded up.
- Yards/meters, inches/centimeters, and grams/ounces conversions.
- Gauge-based stitch counts with repeat multiples and edge stitches.
- Gauge-based row counts.
- One-round increases/decreases for US single crochet, with uneven remainders distributed.
- Percentage changes.
- Remaining time from entered minutes and completed/total rows.

Inputs and formulas are shown. Gauge, yarn, and time results explain their assumptions. Natural-language math requests use validated calculator operations rather than generated JavaScript or `eval`. For example, 40 → 48 stitches produces `(4 sc, inc) × 8`, which consumes 40 stitches and produces 48.

## Chat, catalog, and privacy

Text chat reuses the platform's installed Qwen VL language file without loading its image projector. It uses the existing `withScrapEngineLock` used by scans, drafts, and model-file operations. Busy requests receive a retry message; no competing model context is started. A timeout or Stop returns control immediately but the lock remains until the outstanding native operation and cleanup finish.

The app's existing model prefetch still controls downloads. The helper reports when the files are not ready rather than pretending to generate an answer. It does not add a cloud fallback.

Catalog lookup can run without AI. Cards reference actual catalog IDs and provide preview actions with thumbnails/fallbacks. Preview does not automatically import or start a pattern. Closing a helper-opened preview returns to the chat.

Chat is **in memory only**, shared across helper surfaces. It survives minimizing/navigation during that app session. New conversation, logout, or an account change clears it. Restarting the app clears it. No conversation is added to Firebase, AsyncStorage, analytics, or a cloud model. Photos are not attached to chat in this version; the helper can guide users to the existing Leftover yarn workflow.

The helper can explain existing app features, pattern excerpts, abbreviations, US/UK differences, and crochet techniques. It cannot watch linked videos, retrieve unseen original instructions, browse the web, or change a project's counter/timer/notes. It does not bypass the existing checked pattern-draft feature to generate unrestricted garments.

## Verification performed

- TypeScript check.
- `npm run check-helper`: calculator examples and invalid inputs, thousands of shaping-count combinations, account/context isolation, catalog-ID validation, cancellation during initialization, timeout cleanup, shared-engine exclusion, and native token-budget trimming. Native model bindings are mocked for these tests.
- Existing `check-crochet-machine.ts`, `check-scrap-yarn-ai.ts`, and `check-leftover-yarn.ts` checks.
- Targeted ESLint for changed/new TypeScript files.
- Metro exports for iOS, Android, and web; these validate bundling, not Xcode/Gradle compilation or model quality.
- Full-project lint still reports the base repository's 57 existing errors. Changed helper files pass their targeted lint check.

Automated browser interaction was attempted but could not run: the local browser binary download failed, and the cloud browser could not reach the local preview server. **Visual layout, actual phone modal behavior, real AI answer quality, latency, GPU compatibility, and peak memory remain unverified.** No cloud EAS build or store deployment was triggered here.

## Physical-phone checklist before merging

1. Open Helper on Patterns, Active Project, and Me. Check that it does not cover primary controls.
2. Open a pattern/preview, tap Ask Helper, and verify the About chip. Ask for a missing instruction; the reply should request the exact line rather than invent it.
3. Use every calculator. Check keyboard visibility, decimals, negative percentage changes, orientation, and large text.
4. Minimize/reopen; switch patterns; clear context; choose the active project. Old-pattern evidence must not bleed into a new answer.
5. Find catalog patterns, open a thumbnail card, and return. Original project, yarn photo, and chat must remain intact.
6. Start a yarn scan and try chat. Only one operation should own the model. Try Stop, Retry, New conversation, and close/reopen during native loading.
7. Sign out or change accounts during a response. The old conversation and late response must disappear.
8. Wait for model preparation, enable airplane mode, and ask a short crochet question. Calculators and bundled catalog search should also work. Online tutorial playback still needs internet.
9. Check actual local model answers, cold load/generation time, heat, memory, and crashes using Instruments/Android Studio. Do not infer quality or performance from mocked tests.
