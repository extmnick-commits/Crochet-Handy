# Tester invite (Expo Go)

Copy the block below, replace `PASTE_EXP_LINK_HERE` with the `exp://` URL from your terminal (after running `npm run share` or `.\scripts\share-expo-go.ps1`), and send via iMessage, SMS, or email.

---

**Subject:** Crochet Handy — try the app (Expo Go)

Hi!

We’d like you to try **Crochet Handy** on your phone. No TestFlight, no sideloading — just Expo Go.

**What you need**

1. Install **Expo Go** (free):
   - **iPhone:** [Expo Go on the App Store](https://apps.apple.com/app/expo-go/id982107779)
   - **Android:** [Expo Go on Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. Open this link on your phone (or scan the QR code we send separately):

   `PASTE_EXP_LINK_HERE`

   - **iPhone:** paste the link into **Safari** and go. When prompted, tap **Open in Expo Go**.
   - **iPhone (QR):** open the **Camera** app, scan the QR from our screen, tap the banner, then **Open in Expo Go**.
   - **Android:** open the link in Chrome, or in **Expo Go** use **Scan QR code**.

3. Wait for the bundle to load (first load can take a minute). The dev server must stay running on our side while you test.

**Notes**

- Use the same Wi‑Fi or cellular — the tunnel link works from anywhere.
- If the app won’t open, confirm Expo Go is installed and try the link again in Safari (iOS) or Chrome (Android).
- Feedback welcome — reply to this message with bugs or screenshots.

Thanks for helping us test!

---

## For the project owner

Start a tunnel session:

```powershell
.\scripts\share-expo-go.ps1
```

or:

```bash
npm run share
```

Tunnel requires `@expo/ngrok` (listed in `devDependencies`). The share script installs it automatically if missing.
