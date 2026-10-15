# TestFlight smoke checklist

Run on a **production** iOS build from EAS (`production` profile) after install via TestFlight.

## Build & submit

First iOS build: run interactively once (see [EAS_IOS_SETUP.md](./EAS_IOS_SETUP.md)).

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

Ensure Expo **production** environment variables are set (`node scripts/sync-eas-production-env.mjs` from a filled `.env`).

## On device

- [ ] Cold launch — welcome or tabs, no blank screen
- [ ] **Sign in / create account** (Firebase email)
- [ ] Pattern feed loads (catalog CDN)
- [ ] Start or open project on **Active** — timer, row counter
- [ ] **Camera** and **photo library** progress photo
- [ ] Open pattern with YouTube — player loads in embed
- [ ] **Me** — sign out, sign back in (auth persistence)
- [ ] **Me → Delete account** (test on a throwaway account only)
- [ ] **Privacy** / **Support** links open in browser

## Firestore rules

Rules in [`firestore.rules`](../firestore.rules) are deployed to project `crochet-handy`. Re-deploy after changes:

```bash
npx firebase-tools deploy --only firestore:rules --project crochet-handy
```
