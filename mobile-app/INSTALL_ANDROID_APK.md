# Installable Android app (APK) — follow in order

Your project builds **installable APKs** via **[EAS Build](https://docs.expo.dev/build/introduction/)** (cloud). Expo Go is **not** a standalone installable production app — use EAS once you’re ready for a real APK.

---

## What you need first

| Requirement | Purpose |
|------------|---------|
| Free [expo.dev](https://expo.dev) account | Cloud builds attach to your org/user |
| `npx expo login` on your PC | So EAS can upload & build |

---

## Step A — Login

```powershell
cd D:\casifly\mobile-app
npx expo login
```

---

## Step B — Link project (adds `projectId`)

Run **`eas init`** once in this folder. It attaches **`casifly-mobile`** to your Expo dashboard and merges **`extra.eas.projectId`** into your evaluated config.

```powershell
cd D:\casifly\mobile-app
npx eas-cli init
```

Accept the prompts. If asked for slug, **`casifly-mobile`** matches `app.config.ts`.

---

## Step C — Start the APK build

```powershell
cd D:\casifly\mobile-app
npm run eas:apk:preview
```

- First run: Expo usually offers to **generate a new Android upload keystore** — accept (**managed credentials**).

The terminal prints a **build URL** on expo.dev.

---

## Step D — Install on your phone

1. Wait until the dashboard shows **Finished**.
2. **Download APK** from the artifact link.
3. Copy to Android device → tap the file → **Install**.  
   - You may need **Settings → Security → Install unknown apps** for whichever app opens the APK (Downloads, Files, Chrome).

Installed app identity:

- Display name: **CASIFLY**
- Package: **`com.casifly.mobile`** (see `app.config.ts`)

---

## Changing the website URL in the APK

The WebView URL is **fixed when the APK is built** (not at runtime).

Before building:

1. **Best check:** open your real site in **Chrome on the same phone** — if it fails there, DNS/hosting must be fixed first.
2. Point the build at your real URL using **one** of:
   - **`app.config.ts`** — change `DEFAULT_WEB_URL`
   - **[Expo dashboard](https://expo.dev)** → project → **Environment variables** → **`EXPO_PUBLIC_WEB_URL`** for the “preview” / “production” environments (recommended; local **`.env`** is often gitignored and **not** uploaded to EAS unless you set that up explicitly)
   - **`eas.json`** — add `"env": { "EXPO_PUBLIC_WEB_URL": "https://..." }` inside the profile you use

Full walkthrough (including **`net::ERR_NAME_NOT_RESOLVED`**): **[CONFIGURE_WEB_URL_FOR_APK.md](CONFIGURE_WEB_URL_FOR_APK.md)**.

Then run a **new** `npm run eas:apk:preview` and reinstall the APK.

---

## Production builds

```powershell
npm run eas:apk:production
```

`production` in `eas.json` uses **`autoIncrement`** so Google Play **`versionCode`** bumps automatically.

---

## Play Store notes

New Play uploads often require **AAB** (App Bundle). In `eas.json`, change **`android.buildType`** from **`"apk"`** to **`"app-bundle"`** on the profile you use for Store release, then run the same `eas build`.

---

## If you insist on fully local APKs

You need Android Studio + JDK + keystore wiring, then `expo prebuild` + Gradle. That’s the long path — **EAS is the Expo default** unless you already maintain native Android tooling.
