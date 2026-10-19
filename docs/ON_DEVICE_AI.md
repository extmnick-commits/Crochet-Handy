# On-device scrap AI

Crochet Handy personalizes leftover-yarn ideas with `llama.rn` 0.13 on iOS and Android. The same JavaScript path runs on both. Apple Foundation Models and Android ML Kit Prompt / Gemini Nano are not wired in. They only exist on some devices, and they have not been tested here.

The sheet still downloads one model: Bartowski `Qwen2.5-1.5B-Instruct-Q4_K_M` at revision `9eadc66189c7641e1ddd226b8267a9119b2ce2d4` (986,048,768 bytes, SHA-256 `1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370`). A smaller 0.5B file is documented in `scripts/compare-scrap-models.ts` for a device comparison. The app does not download it, and a smaller download is not treated as a faster or better model.

Project ideas work before that download. Yardage and hook size come from the app. The text model only chooses among plans and colors that already fit, and it does not see the photo.

## What a new native build is for

`app.config.js` keeps iOS Metal by deleting `RNLLAMA_DISABLE_METAL` when the Podfile is generated. Android OpenCL and the optional Hexagon library are declared by the `llama.rn` plugin (`enableOpenCLAndHexagon`). Hexagon stays off at runtime unless `SCRAP_HEXAGON_OPT_IN` in `utils/scrapYarnSession.ts` is turned on. `llama.rn` 0.13 does not read `enableMetal` or `enableVulkan`, and the published package does not include a Vulkan backend.

Those native settings are compiled into the app. `eas update` cannot turn Metal or OpenCL on or off. Install a new build after changing them.

OpenCL in this `llama.rn` version is documented for Adreno GPUs and mainly Q4_0 / Q6_K weights. This app's Q4_K_M file may fail GPU init. Android then retries once on CPU. That retry is not a performance claim.

## Install a preview build

Do not submit these builds to the store.

Android preview APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

iPhone, internal distribution. Register the device, then build:

```bash
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

`device:create` prints a registration link. Open it on the iPhone, install the profile, and wait until the device shows up in the Apple team. The preview profile in `eas.json` is internal and produces an iPhone build (`simulator: false`) and an Android APK.

## Checks

`npx tsx scripts/check-scrap-yarn-ai.ts` mocks file IO and `llama.rn`. It covers truncated and corrupt downloads, output validation, yardage limits, cancel during init and generation, timeouts, and overlapping requests. It does not load a GGUF, talk to a GPU, or measure memory.

`npx tsc --noEmit` and `npx expo lint` typecheck and lint the project. `npx expo export` for ios, android, and web only checks that the JavaScript bundle builds.

GPU init, `gpu` / `devices` / `reasonNoGPU`, the real 986 MB download, Jetsam, and peak memory need a physical iPhone and an Android phone on a new preview build. Set `EXPO_PUBLIC_SCRAP_AI_BENCH=1` to append one JSON line per completion under the app documents `models/scrap-ai-bench.jsonl`. Fill `peakMemoryBytes` from Instruments or Android Studio, then run:

```bash
npx tsx scripts/compare-scrap-models.ts current.jsonl smaller.jsonl
```

If latency or peak memory is missing, the script does not name a winner.
