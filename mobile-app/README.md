# CASIFLY Mobile (Expo WebView Shell)

Thin **Expo SDK 56** wrapper that launches the CASIFLY web experience inside `react-native-webview`, tuned for Android (Safe Area, hardware back stack, IME, pull-to-refresh, offline/error UX).

## Production URL source

This project targets **`https://app.casifly.app`**, documented in [`DEPLOY.md`](../DEPLOY.md) (`CORS_ORIGIN`). Override anytime through environment configuration (see below).

## Run locally

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (recommended for quickest smoke tests) or press `a` to open an Android emulator on a machine configured with Android Studio.

## Override the embedded website URL

1. Duplicate `.env.example` → `.env`
2. Set `EXPO_PUBLIC_WEB_URL=https://your-host.example/path`
3. Restart Metro (`npm run start`)

`app.config.ts` also embeds the default production URL inside `extra.websiteUrl` for release binaries when no env flag is supplied.

## EAS Build (APK profiles)

Configured in **`eas.json`**:

| Profile      | Artifact | Typical use                                      |
|-------------|----------|---------------------------------------------------|
| `preview`   | APK      | Internal QA installs                              |
| `production`| APK (`autoIncrement` version codes) | Play Store uploads / signed releases |

### One-time Expo account linking

From this directory:

```bash
npx expo login
eas init                     # attaches EAS metadata + fills extra.eas.projectId
eas build --platform android --profile preview
```

Shortcuts:

```bash
npm run eas:apk:preview
npm run eas:apk:production
```

> **Signing:** APK/AAB uploads require Google Play credential setup in [expo.dev](https://expo.dev) (“Credentials” tab). Expo documents the keystores Expo manages versus ones you upload.

## Permissions & networking

Android automatically receives `INTERNET` for standalone builds (`WebView`). `android.usesCleartextTraffic` is **disabled** whenever `EXPO_PUBLIC_WEB_URL` (or embedded default) is HTTPS; enable HTTP dev servers by supplying an `http://` URL (cleartext auto-enables).

## Project layout

```
src/
  screens/CasiflyWebPortal.tsx  # Splash hand-off + Web shell (PTR, IME, connectivity)
  components/                   # Offline banner, error notice, loaders
  config/urls.ts                # Resolved WebView URI
```

## Troubleshooting quick hits

| Symptom | Fix |
|---------|-----|
| Stuck splash | Connectivity probe + 24 s watchdog auto-dismiss; inspect Metro logs |
| Offline false positives | Older Android captive portals sometimes report flaky `isInternetReachable`; tap **Try again** |
| Nested scroll quirks | Nested `ScrollView` + `nestedScrollEnabled` WebView mimics OEM pull gestures—use Android 10+ |

## Repo scope

Everything under `mobile-app/` is intentionally isolated—the main CASIFLY Vite SPA is untouched.
