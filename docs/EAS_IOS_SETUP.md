# First iOS production build (EAS)

Production environment variables are configured on Expo (`production` environment). Sync from local `.env` anytime:

```bash
node scripts/sync-eas-production-env.mjs
```

## One-time: Apple credentials

The first iOS **production** build must run **interactively** so EAS can create or validate your distribution certificate and App Store provisioning profile:

```bash
npx eas-cli@latest build --platform ios --profile production
```

Answer the prompts to log in to Apple and assign credentials for bundle ID `com.crochethandy.app`.

After credentials exist, CI/non-interactive builds work:

```bash
npx eas-cli@latest build --platform ios --profile production --non-interactive
```

## App Store Connect

Create an app in [App Store Connect](https://appstoreconnect.apple.com) with bundle ID `com.crochethandy.app` before submitting to TestFlight.

```bash
npx eas-cli@latest submit --platform ios --profile production
```
