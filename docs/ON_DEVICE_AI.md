# On-device scrap AI

Crochet Handy inspects a leftover-yarn photo with `llama.rn` 0.13 on iOS and Android. The language file cannot see the photo. Each phone also downloads the matching vision projector and passes the local image into the request. Apple Foundation Models and Android ML Kit Prompt / Gemini Nano are not wired in.

The photo stays on the device. The installed iPhone and Android apps start downloading that platform's vision pair as soon as the app opens. Expo Go and web cannot run the native engine. Those builds say so, and they do not fill in preset findings.

iOS uses Metal and the llama.cpp maintainers' Qwen2.5-VL 3B Instruct pair at revision `5037fcf163dd95d1e41d1974465f0898ed108ca2`:

- `Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` — 1,929,901,056 bytes, SHA-256 `d02fe9b69ad8cadbbd228e387667af66612c44bed29ffc8eb1e7caf9ac486c12`
- `mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf` — 844,757,728 bytes, SHA-256 `980c9b2f78c04e6cff93d277ada09e768394f112d75db3b4e9dea8a69f9fb904`

iOS does not retry that Q4_K model on the CPU. A failed Metal init, including the simulator and iPhones older than the A14, is reported as unsupported.

Android uses OpenCL and Unsloth's Qwen2.5-VL 3B Instruct pair at revision `20ce64893974f3faa729fe3dbdd70f8cabc2523c`:

- `Qwen2.5-VL-3B-Instruct-Q4_0.gguf` — 1,828,484,448 bytes, SHA-256 `b7bbe51de4b0880be2b6b0c6891bc8e6666e4e535bdc65c78dcbd475d6824b4d`
- `mmproj-F16.gguf` — 1,338,428,256 bytes, SHA-256 `4c1240f514de94c81b70709b0f9a80c7e3297598ea7c83f39dc00b18ee5be60c`

The Android text model tries the GPU once, then retries on the CPU. The F16 projector stays on the CPU. The smaller SmolVLM trial files are deleted on the next scan. A text file from one publisher is not paired with the other publisher's projector.

The older text-only Qwen2.5 1.5B file remains pinned for the previous personalization checks. The leftover sheet does not download it and does not ask it to inspect a photo. A smaller 0.5B file is documented in `scripts/compare-scrap-models.ts` for a device comparison. The app does not download it.

Hook ranges, catalog matches, and draft stitch counts come from the app. The model cannot invent a catalog tutorial, a gram weight, or an exact yardage. Generated patterns are drafts and are kept separate from tutorials.

## What a new native build is for

`app.config.js` keeps iOS Metal by deleting `RNLLAMA_DISABLE_METAL` when the Podfile is generated. Android OpenCL and the optional Hexagon library are declared by the `llama.rn` plugin (`enableOpenCLAndHexagon`). Hexagon stays off at runtime unless `SCRAP_HEXAGON_OPT_IN` in `utils/scrapYarnSession.ts` is turned on. `llama.rn` 0.13 does not read `enableMetal` or `enableVulkan`, and the published package does not include a Vulkan backend.

Those native settings are compiled into the app. `eas update` cannot turn Metal or OpenCL on or off. Install a new build after changing them.

OpenCL in this `llama.rn` version is documented for Adreno GPUs and mainly Q4_0 / Q6_K weights. Android therefore downloads the Q4_0 vision file. If that GPU init fails, the text model retries once on CPU. The vision projector stays on the CPU because this OpenCL backend has no kernels for F16 vision weights.

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

`npx tsx scripts/check-scrap-yarn-ai.ts` mocks file IO and `llama.rn`. It covers truncated and corrupt downloads, the iOS and Android vision file pins, image input, output validation, yardage limits, cancel during init and generation, timeouts, and overlapping requests. It does not load a GGUF, talk to a GPU, or measure memory.

`npx tsc --noEmit` and `npx expo lint` typecheck and lint the project. `npx expo export` for ios, android, and web only checks that the JavaScript bundle builds.

GPU init, `gpu` / `devices` / `reasonNoGPU`, the real 986 MB download, Jetsam, and peak memory need a physical iPhone and an Android phone on a new preview build. Set `EXPO_PUBLIC_SCRAP_AI_BENCH=1` to append one JSON line per completion under the app documents `models/scrap-ai-bench.jsonl`. Fill `peakMemoryBytes` from Instruments or Android Studio, then run:

```bash
npx tsx scripts/compare-scrap-models.ts current.jsonl smaller.jsonl
```

If latency or peak memory is missing, the script does not name a winner.
