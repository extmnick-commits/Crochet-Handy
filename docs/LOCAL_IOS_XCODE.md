# Local iOS build with Xcode

Use this when you want a **standalone** Crochet Handy app on your iPhone without Expo Go and without EAS cloud builds. You need **macOS**, **Xcode**, and an **Apple ID** (free works for your own device; TestFlight/App Store needs the paid Developer Program).

Bundle ID: `com.crochethandy.app`  
Open **`ios/CrochetHandy.xcworkspace`** (never the `.xcodeproj` alone after CocoaPods).

## Quick start

From the repo root:

```bash
./scripts/ios-xcode-local.sh
```

That refreshes native projects if needed, runs `pod install`, and opens the workspace in Xcode.

## First-time setup

1. Install Xcode from the App Store and open it once (license + components).
2. Install CocoaPods if you do not have it: `sudo gem install cocoapods` (or Homebrew `brew install cocoapods`).
3. Copy `.env.example` → `.env` and fill Firebase / YouTube keys (used by `app.config.js` at prebuild time).
4. Node on your PATH (see `ios/.xcode.env` — Expo uses it for bundle scripts).

Regenerate native iOS after plugin or dependency changes:

```bash
npx expo prebuild --platform ios --clean
cd ios && pod install && cd ..
```

`--clean` deletes and recreates `ios/`; only use when native config changed.

## Run on your iPhone (Debug, with Metro)

Good for daily development; JS loads from your Mac:

```bash
npx expo start
# other terminal:
npx expo run:ios --device
```

Or in Xcode: select your **iPhone** as the run destination, **Debug** scheme, **Run** (⌘R). Start Metro first.

## Standalone on device (Release, no Metro)

Embeds the JavaScript bundle in the app — what you want for “real” offline use on your phone:

```bash
npx expo run:ios --device --configuration Release
```

Or in Xcode:

1. **Product → Scheme → Edit Scheme… → Run → Build Configuration → Release**
2. Connect the iPhone, trust the computer, select the device as destination.
3. **Signing & Capabilities**: pick your **Team** (Personal Team is fine for your device).
4. **Run** (⌘R).

First install: on the iPhone, **Settings → General → VPN & Device Management** → trust the developer app.

## Archive an `.ipa` (install / sideload)

1. In Xcode, destination **Any iOS Device (arm64)** (not a simulator).
2. **Product → Archive** (Release configuration).
3. **Distribute App** → **Development** (your devices) or **Ad Hoc** (registered UDIDs) → export `.ipa`.

For App Store / TestFlight, use **App Store Connect** distribution (same Archive flow) or EAS (`docs/EAS_IOS_SETUP.md`).

## Signing notes

- **Personal Team**: install on devices tied to your Apple ID; app expires after ~7 days (reinstall from Xcode).
- **Paid Apple Developer Program**: longer-lived installs, TestFlight, App Store.

`llama.rn` entitlements are applied via the config plugin; if signing fails on capabilities, run `npx expo prebuild --platform ios` again so the Podfile Metal banner and plugins stay in sync.

## Local AI on device

Native Metal + `llama.rn` are compiled into this build. Helper / on-device models **download after install**; use a **physical iPhone (A14 or newer)** for Metal. Simulator is unreliable for vision/GPU paths (`docs/ON_DEVICE_AI.md`).

## Troubleshooting

| Issue | Fix |
|--------|-----|
| `pod: command not found` | Install CocoaPods |
| Build fails after `package.json` native deps change | `npx expo prebuild --platform ios` then `pod install` |
| “No signing certificate” | Xcode → target **CrochetHandy** → Signing → Team |
| App opens but red Metro error | You built Debug without Metro; use **Release** or start `npx expo start` |
| Stale native project | `npx expo prebuild --platform ios --clean` (backup first) |
